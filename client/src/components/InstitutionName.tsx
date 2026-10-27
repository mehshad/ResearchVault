import { useTheme } from "@/contexts/ThemeContext";

/**
 * The institution's name, from the theme.
 *
 * Fifty labels said "Sidra" in a product that themes itself for three
 * institutions: "Sidra Lead PI", "Sidra budget", "Sidra Branch". Under the
 * HBKU or WCM-Q theme every one of them was simply wrong. This reads the
 * name the theme carries, so a label says whose it is.
 *
 * `short` gives the form used inside a label ("Sidra", "HBKU", "WCM-Q");
 * without it the full name ("Sidra Medicine").
 */
export function InstitutionName({ short = false }: { short?: boolean }) {
  const { institutionName, institutionShortName } = useTheme();
  return <>{short ? institutionShortName : institutionName}</>;
}
