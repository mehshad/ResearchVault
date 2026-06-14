import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, Room, Scientist } from "@shared/schema";
import { formatFullName } from "@/utils/nameUtils";
import { 
  Plus, Search, Edit, MoreHorizontal, Building2, 
  ChevronDown, ChevronUp, MapPin, Users, 
  Shield, Wrench
} from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PermissionWrapper } from "@/components/PermissionWrapper";
import { usePermissions } from "@/hooks/usePermissions";

export default function FacilitiesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBuildings, setExpandedBuildings] = useState<Set<number>>(new Set());
  const { currentUser } = useCurrentUser();
  const { canEdit } = usePermissions();

  const { data: buildings, isLoading: buildingsLoading } = useQuery<Building[]>({
    queryKey: ['/api/buildings'],
    queryFn: () => fetch('/api/buildings').then(res => res.json()),
  });

  const { data: allRooms, isLoading: roomsLoading } = useQuery<Room[]>({
    queryKey: ['/api/rooms'],
    queryFn: () => fetch('/api/rooms').then(res => res.json()),
  });

  const { data: scientists } = useQuery<Scientist[]>({
    queryKey: ['/api/scientists'],
    queryFn: () => fetch('/api/scientists').then(res => res.json()),
  });

  // Group rooms by building
  const roomsByBuilding = allRooms?.reduce((acc, room) => {
    if (!acc[room.buildingId]) {
      acc[room.buildingId] = [];
    }
    acc[room.buildingId].push(room);
    return acc;
  }, {} as Record<number, Room[]>) || {};

  const filteredBuildings = buildings?.filter(building => 
    building.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    building.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleBuildingExpansion = (buildingId: number) => {
    const newExpanded = new Set(expandedBuildings);
    if (newExpanded.has(buildingId)) {
      newExpanded.delete(buildingId);
    } else {
      newExpanded.add(buildingId);
    }
    setExpandedBuildings(newExpanded);
  };

  const getBiosafetyLevelBadge = (level: string) => {
    const colors = {
      'BSL-1': 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      'BSL-2': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
      'BSL-3': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
      'BSL-4': 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      'ABSL-1': 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
      'ABSL-2': 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
    };
    return colors[level as keyof typeof colors] || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  };

  const getScientistInfo = (scientistId: number | null) => {
    if (!scientistId || !scientists) return null;
    return scientists.find(s => s.id === scientistId);
  };

  if (buildingsLoading || roomsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">Facilities</h1>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PermissionWrapper currentUserRole={currentUser.role} navigationItem="facilities">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-semibold text-foreground">Facilities</h1>
          <div className="flex gap-2">
            <PermissionWrapper 
              currentUserRole={currentUser.role} 
              navigationItem="facilities"
              requiredPermissions={['canAdd']}
            >
              <Link href="/facilities/buildings/create">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2" data-testid="button-add-building">
                  <Building2 className="h-4 w-4" />
                  Add Building
                </Button>
              </Link>
            </PermissionWrapper>
            <PermissionWrapper 
              currentUserRole={currentUser.role} 
              navigationItem="facilities"
              requiredPermissions={['canAdd']}
            >
              <Link href="/facilities/rooms/create">
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2" data-testid="button-add-room">
                  <Plus className="h-4 w-4" />
                  Add Room
                </Button>
              </Link>
            </PermissionWrapper>
          </div>
        </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 dark:text-gray-500" />
              <Input
                placeholder="Search buildings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredBuildings?.map(building => {
              const buildingRooms = roomsByBuilding[building.id] || [];
              const isExpanded = expandedBuildings.has(building.id);
              
              return (
                <Card key={building.id} className="border-l-4 border-l-blue-500">
                  <CardHeader 
                    className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors dark:hover:bg-gray-900"
                    onClick={() => toggleBuildingExpansion(building.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBuildingExpansion(building.id);
                          }}
                          className="p-1 h-6 w-6"
                        >
                          {isExpanded ? 
                            <ChevronUp className="h-4 w-4" /> : 
                            <ChevronDown className="h-4 w-4" />
                          }
                        </Button>
                        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <div>
                          <CardTitle className="text-lg">{building.name}</CardTitle>
                          {building.address && (
                            <p className="text-sm text-gray-600 flex items-center gap-1 mt-1 dark:text-gray-300">
                              <MapPin className="h-3 w-3" />
                              {building.address}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {buildingRooms.length} rooms
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid="button-building-menu">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <PermissionWrapper 
                              currentUserRole={currentUser.role} 
                              navigationItem="facilities"
                              requiredPermissions={['canEdit']}
                            >
                              <DropdownMenuItem asChild>
                                <Link href={`/facilities/buildings/edit/${building.id}`} data-testid={`button-edit-building-${building.id}`}>
                                  Edit Building
                                </Link>
                              </DropdownMenuItem>
                            </PermissionWrapper>
                            <PermissionWrapper 
                              currentUserRole={currentUser.role} 
                              navigationItem="facilities"
                              requiredPermissions={['canAdd']}
                            >
                              <DropdownMenuItem asChild>
                                <Link href={`/facilities/rooms/create?buildingId=${building.id}`} data-testid={`button-add-room-for-building-${building.id}`}>
                                  Add Room
                                </Link>
                              </DropdownMenuItem>
                            </PermissionWrapper>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {building.description && (
                      <p className="text-sm text-gray-600 mt-2 dark:text-gray-300">{building.description}</p>
                    )}
                    <div className="flex gap-4 text-sm text-gray-500 mt-2 dark:text-gray-400">
                      {building.totalFloors && (
                        <span>{building.totalFloors} floors</span>
                      )}
                      {building.maxOccupancy && (
                        <span>Max occupancy: {building.maxOccupancy}</span>
                      )}
                    </div>
                  </CardHeader>
                  
                  {isExpanded && buildingRooms.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-sm text-gray-700 mb-3 dark:text-gray-300">Rooms</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Room</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Floor</TableHead>
                              <TableHead>Biosafety Level</TableHead>
                              <TableHead>Supervisor</TableHead>
                              <TableHead>Manager</TableHead>
                              <TableHead className="w-12"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {buildingRooms.map(room => (
                              <TableRow key={room.id}>
                                <TableCell className="font-medium">
                                  {room.roomNumber}
                                </TableCell>
                                <TableCell>{room.roomType || 'N/A'}</TableCell>
                                <TableCell>{room.floor || 'N/A'}</TableCell>
                                <TableCell>
                                  {room.biosafetyLevel ? (
                                    <Badge className={getBiosafetyLevelBadge(room.biosafetyLevel)}>
                                      <Shield className="h-3 w-3 mr-1" />
                                      {room.biosafetyLevel}
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">N/A</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {room.roomSupervisorId ? (
                                    (() => {
                                      const supervisor = getScientistInfo(room.roomSupervisorId);
                                      return supervisor ? (
                                        <div className="text-sm">
                                          <div className="font-medium text-gray-900 dark:text-gray-100">{formatFullName(supervisor)}</div>
                                          <div className="text-gray-500 text-xs dark:text-gray-400">{supervisor.email}</div>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">Not found</span>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">Not assigned</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {room.roomManagerId ? (
                                    (() => {
                                      const manager = getScientistInfo(room.roomManagerId);
                                      return manager ? (
                                        <div className="text-sm">
                                          <div className="font-medium text-gray-900 dark:text-gray-100">{formatFullName(manager)}</div>
                                          <div className="text-gray-500 text-xs dark:text-gray-400">{manager.email}</div>
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">Not found</span>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500">Not assigned</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <PermissionWrapper 
                                    currentUserRole={currentUser.role} 
                                    navigationItem="facilities"
                                    requiredPermissions={['canEdit']}
                                  >
                                    <Link href={`/facilities/rooms/edit/${room.id}`}>
                                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`button-edit-room-${room.id}`}>
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  </PermissionWrapper>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            
            {filteredBuildings?.length === 0 && (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4 dark:text-gray-500" />
                <h3 className="text-lg font-medium text-gray-900 mb-2 dark:text-gray-100">No buildings found</h3>
                <p className="text-gray-600 mb-4 dark:text-gray-300">
                  {searchQuery ? 'Try adjusting your search criteria.' : 'Get started by adding your first building.'}
                </p>
                {!searchQuery && (
                  <PermissionWrapper 
                    currentUserRole={currentUser.role} 
                    navigationItem="facilities"
                    requiredPermissions={['canAdd']}
                  >
                    <Link href="/facilities/buildings/create">
                      <Button className="create-button" data-testid="button-add-building-empty-state">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Building
                      </Button>
                    </Link>
                  </PermissionWrapper>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </PermissionWrapper>
  );
}