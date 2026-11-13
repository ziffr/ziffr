// Labels that name a country get a flag (flag-icons, MIT). English and German names, plus ISO codes.
const NAMES: Record<string, string> = {
  germany: "de", deutschland: "de", austria: "at", österreich: "at", switzerland: "ch", schweiz: "ch",
  netherlands: "nl", niederlande: "nl", holland: "nl", france: "fr", frankreich: "fr", belgium: "be", belgien: "be",
  luxembourg: "lu", luxemburg: "lu", italy: "it", italien: "it", spain: "es", spanien: "es", portugal: "pt",
  poland: "pl", polen: "pl", czechia: "cz", "czech republic": "cz", tschechien: "cz", denmark: "dk", dänemark: "dk",
  sweden: "se", schweden: "se", norway: "no", norwegen: "no", finland: "fi", finnland: "fi", ireland: "ie", irland: "ie",
  "united kingdom": "gb", uk: "gb", "great britain": "gb", großbritannien: "gb", grossbritannien: "gb",
  "united states": "us", usa: "us", "vereinigte staaten": "us", canada: "ca", kanada: "ca", japan: "jp",
  china: "cn", india: "in", indien: "in", brazil: "br", brasilien: "br", australia: "au", australien: "au",
  hungary: "hu", ungarn: "hu", greece: "gr", griechenland: "gr", romania: "ro", rumänien: "ro", turkey: "tr", türkei: "tr",
};

export function countryCode(label: string): string | null {
  const k = label.trim().toLowerCase();
  if (NAMES[k]) return NAMES[k];
  return /^[a-z]{2}$/.test(k) && Object.values(NAMES).includes(k) ? k : null;
}
