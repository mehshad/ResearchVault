/** Grant figures on the main dashboard, all money expressed in QAR. */
export interface GrantDashboardStats {
  /** Grants carrying the award milestone, whatever their status has become. */
  awarded: number;
  /** Status is currently active. */
  active: number;
  /**
   * Every grant in the system. All of them were submitted at some point, so
   * counting only the "submitted" status made this smaller than the awarded
   * count -- which reads as impossible rather than as a different question.
   */
  submitted: number;
  /** Submitted, pending or in review: still waiting on the funder. */
  underReview: number;
  totalReceivedQar: number;
  /** True when every amount converted at a pegged rate, so the total is exact. */
  exact: boolean;
  /** Currencies with no rate, left out of the total rather than guessed at. */
  unconverted: string[];
  byFunder: Array<{ funder: string; grants: number; qar: number; exact: boolean }>;
}
