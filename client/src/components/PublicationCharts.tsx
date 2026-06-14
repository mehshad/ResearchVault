import React from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Award } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface Publication {
  id: number;
  title: string;
  authors: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  publicationDate: string;
  publicationType: string;
  status: string;
  abstract: string;
  authorshipType: string;
  authorPosition: number | null;
}

interface AuthorshipStats {
  year: number;
  authorshipType: string;
  count: number;
}

interface JournalImpactFactor {
  year: number;
  impactFactor: string | null;
  quartile: string | null;
}

/**
 * Pick the impact-factor row that best matches a publication year: the exact
 * year if available, otherwise the closest year that actually has an IF value.
 */
function pickIfRow(rows: JournalImpactFactor[], pubYear: number): JournalImpactFactor | null {
  const valid = rows.filter(r => r.impactFactor != null && Number.isFinite(parseFloat(r.impactFactor as string)));
  if (!valid.length) return null;
  const exact = valid.find(r => r.year === pubYear);
  if (exact) return exact;
  return valid.reduce<JournalImpactFactor | null>(
    (best, r) => !best || Math.abs(r.year - pubYear) < Math.abs(best.year - pubYear) ? r : best,
    null,
  );
}

interface PublicationChartsProps {
  scientistId: number;
  yearsSince?: number;
}

const authorshipColors = {
  'First Author': '#3b82f6', // blue
  'Contributing Author': '#10b981', // green
  'Senior/Last Author': '#8b5cf6', // purple
  'Corresponding Author': '#ef4444', // red
};

const authorshipOrder = ['First Author', 'Contributing Author', 'Senior/Last Author', 'Corresponding Author'];
const chartAuthorshipOrder = ['First Author', 'Contributing Author', 'Senior/Last Author']; // Exclude Corresponding Author from chart to avoid overlap

export function PublicationCharts({ scientistId, yearsSince = 5 }: PublicationChartsProps) {
  const { data: publications = [], isLoading: pubLoading } = useQuery<Publication[]>({
    queryKey: [`/api/scientists/${scientistId}/publications?years=${yearsSince}`],
  });

  const { data: authorshipStats = [], isLoading: statsLoading } = useQuery<AuthorshipStats[]>({
    queryKey: [`/api/scientists/${scientistId}/authorship-stats?years=${yearsSince}`],
  });

  // Unique journals among publications that have a journal + date, so we fetch
  // each journal's impact-factor history exactly once (deduped) for the stats.
  const uniqueJournals = React.useMemo(() => {
    const set = new Set<string>();
    publications.forEach(pub => {
      if (pub.journal && pub.publicationDate) set.add(pub.journal);
    });
    return Array.from(set);
  }, [publications]);

  const historicalIfResults = useQueries({
    queries: uniqueJournals.map(journal => ({
      queryKey: [`/api/journal-impact-factors/historical/${encodeURIComponent(journal)}`],
    })),
  });

  // True while any journal IF history is still loading, so we can avoid showing
  // a misleading "N/A" / "0" flash before the lookups resolve.
  const ifLoading = uniqueJournals.length > 0 && historicalIfResults.some(r => r.isLoading);

  // Calculate impact factor statistics from the fetched journal IF history.
  const impactFactorStats = React.useMemo(() => {
    if (!publications.length) return null;

    const withJournal = publications.filter(pub => pub.journal && pub.publicationDate);
    if (withJournal.length === 0) return null;

    const rowsByJournal = new Map<string, JournalImpactFactor[]>();
    uniqueJournals.forEach((journal, i) => {
      const data = historicalIfResults[i]?.data as JournalImpactFactor[] | undefined;
      rowsByJournal.set(journal, Array.isArray(data) ? data : []);
    });

    let ifSum = 0;
    let ifCount = 0;
    let highImpactPubs = 0;
    for (const pub of withJournal) {
      const rows = rowsByJournal.get(pub.journal) || [];
      const row = pickIfRow(rows, new Date(pub.publicationDate).getFullYear());
      if (!row) continue;
      const ifVal = parseFloat(row.impactFactor as string);
      if (Number.isFinite(ifVal)) {
        ifSum += ifVal;
        ifCount++;
      }
      if (row.quartile === 'Q1') highImpactPubs++;
    }

    return {
      totalWithJournal: withJournal.length,
      averageImpactFactor: ifCount > 0 ? ifSum / ifCount : 0,
      highImpactPubs,
    };
  }, [publications, uniqueJournals, historicalIfResults]);

  const chartData = React.useMemo(() => {
    if (!authorshipStats.length) return [];
    
    const yearMap = new Map();
    authorshipStats.forEach((stat: AuthorshipStats) => {
      if (!yearMap.has(stat.year)) {
        yearMap.set(stat.year, { year: stat.year });
      }
      
      // Handle compound authorship types by splitting on comma
      const types = stat.authorshipType.split(',').map(type => type.trim());
      types.forEach(type => {
        // Combine Senior Author and Last Author into Senior/Last Author
        const mappedType = (type === 'Senior Author' || type === 'Last Author') ? 'Senior/Last Author' : type;
        const currentCount = yearMap.get(stat.year)[mappedType] || 0;
        yearMap.get(stat.year)[mappedType] = currentCount + parseInt(stat.count.toString());
      });
    });
    
    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
  }, [authorshipStats]);

  if (pubLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Publication Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-gray-200 rounded dark:bg-gray-700"></div>
              <div className="h-48 bg-gray-200 rounded dark:bg-gray-700"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPublications = publications.length;
  const authorshipCounts = publications.reduce((acc: Record<string, number>, pub: Publication) => {
    // Handle compound authorship types by splitting on comma and trimming
    const types = pub.authorshipType.split(',').map(type => type.trim());
    types.forEach(type => {
      // Combine Senior Author and Last Author into Senior/Last Author
      if (type === 'Senior Author' || type === 'Last Author') {
        acc['Senior/Last Author'] = (acc['Senior/Last Author'] || 0) + 1;
      } else {
        acc[type] = (acc[type] || 0) + 1;
      }
    });
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Publication Statistics</CardTitle>
          <CardDescription>
            {totalPublications} publications (Published or In Press only) with authorship breakdown
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            {authorshipOrder.map((type) => {
              const count = authorshipCounts[type] || 0;
              if (count === 0) return null;
              return (
                <div key={type} className="flex justify-between items-center">
                  <div className="text-sm text-gray-600 dark:text-gray-300">{type}</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{count}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Impact Factor Summary */}
      {impactFactorStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Journal Impact Metrics
            </CardTitle>
            <CardDescription>
              Impact factor statistics for publications with journal information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-blue-50 rounded-lg dark:bg-blue-950">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{impactFactorStats.totalWithJournal}</div>
                <div className="text-sm text-blue-600 dark:text-blue-400">Publications with Journal</div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg dark:bg-green-950">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {ifLoading ? '…' : (impactFactorStats.averageImpactFactor > 0 ? impactFactorStats.averageImpactFactor.toFixed(2) : 'N/A')}
                </div>
                <div className="text-sm text-green-600 dark:text-green-400">Average Impact Factor</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg dark:bg-purple-950">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{ifLoading ? '…' : impactFactorStats.highImpactPubs}</div>
                <div className="text-sm text-purple-600 dark:text-purple-400">High Impact (Q1)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Authorship Trends Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Authorship Trends
            </CardTitle>
            <CardDescription>
              Publications by authorship type per year (Published or In Press only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {chartAuthorshipOrder.map((type) => (
                    <Bar 
                      key={type}
                      dataKey={type} 
                      stackId="authorship"
                      fill={authorshipColors[type as keyof typeof authorshipColors]} 
                      name={type}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}