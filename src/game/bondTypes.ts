/** Stored social census: the single read/write shape shared by relationships and annual stats. */
export interface BondCensus {
  closeBonds: number;
  withFriend: number;
  isolated: number;
}
