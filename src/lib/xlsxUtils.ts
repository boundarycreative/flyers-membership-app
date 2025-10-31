// src/lib/xlsxUtils.ts
import * as XLSX from "xlsx";

/* ----------------------------- Types ----------------------------- */
export type SpondMember = {
  firstName: string;
  lastName: string;
  dob?: string;
  squad?: string;
  groups?: string;
  subGroup?: string;
  basketballScotNo?: string; // numeric-only string
};

export type FinanceRow = {
  firstName: string;
  lastName: string;
  dob?: string;
  paidAmount: number;
};

export type JustGoRow = {
  MID?: string; // numeric-only string
  firstName: string;
  lastName: string;
  dob?: string;
  clubMemberStatus?: string;
  expiryDate?: string;
};

export type ComparisonRow = {
  name: string;
  squad: string;
  spondPaid: boolean;
  paidAmount: number;
  hasMembership: boolean;
  membershipStatus?: string;
  membershipExpiry?: string;
  matchMethod: "MID" | "NAME_DOB" | "NAME_ONLY" | "UNMATCHED";
};

/* ------------------------- Small helpers ------------------------- */
const cleanStr = (s?: any) =>
  String(s ?? "").trim().replace(/\r|\n|\u00A0/g, "");

const normLower = (s?: any) => cleanStr(s).toLowerCase();

export function normalizeName(s?: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function nameKey(first?: string, last?: string) {
  return `${normalizeName(first)}|${normalizeName(last)}`;
}
export function nameDobKey(first?: string, last?: string, dob?: string) {
  return `${normalizeName(first)}|${normalizeName(last)}|${dob || ""}`;
}

// Parse Excel or string dates into ISO (YYYY-MM-DD)
export function toISODate(anyDate: any): string | undefined {
  if (!anyDate) return undefined;

  if (anyDate instanceof Date && !isNaN(anyDate.getTime())) {
	return anyDate.toISOString().slice(0, 10);
  }
  if (typeof anyDate === "number") {
	const d = XLSX.SSF.parse_date_code(anyDate);
	if (d) {
	  const mm = String(d.m).padStart(2, "0");
	  const dd = String(d.d).padStart(2, "0");
	  return `${d.y}-${mm}-${dd}`;
	}
  }

  const s = cleanStr(anyDate).replace(/\./g, "/").replace(/-/g, "/");
  const parts = s.split("/");
  if (parts.length === 3) {
	const [a, b, c] = parts;
	if (a.length === 4) return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
	if (c.length === 4) {
	  const p1 = parseInt(a, 10);
	  const p2 = parseInt(b, 10);
	  const dd = p1 > 12 ? p1 : p2;
	  const mm = p1 > 12 ? p2 : p1;
	  return `${c}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
	}
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr(anyDate))) return cleanStr(anyDate);
  return undefined;
}

/* ---------------------- Sheet → objects reader ------------------- */
async function readSheetFromArrayBuffer(ab: ArrayBuffer): Promise<any[]> {
  const wb = XLSX.read(ab);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (!rows.length) return [];

  let headerRowIndex = 0;
  if (
	rows[0] &&
	rows[0].length === 1 &&
	/player membership|20\d{2}\/\d{2}/i.test(String(rows[0][0] || ""))
  ) {
	headerRowIndex = 1;
  }

  for (let i = headerRowIndex; i < Math.min(headerRowIndex + 3, rows.length); i++) {
	const joined = rows[i].map((c) => String(c || "")).join("|").toLowerCase();
	if (
	  /participant.*first.*name|member.*first.*name|firstname/.test(joined) ||
	  /mid|membership/.test(joined)
	) {
	  headerRowIndex = i;
	  break;
	}
  }

  const headers = (rows[headerRowIndex] || []).map((h) => cleanStr(h));
  const dataRows = rows.slice(headerRowIndex + 1);
  console.log("🧾 Detected header row:", headers);
  const objects = dataRows
	.map((r) => {
	  const obj: Record<string, any> = {};
	  headers.forEach((h, i) => {
		if (h) obj[h] = r[i];
	  });
	  return obj;
	})
	.filter((o) => Object.values(o).some((v) => v !== undefined && v !== ""));
  return objects;
}

export async function readXlsxFromFetch(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  const ab = await res.arrayBuffer();
  return await readSheetFromArrayBuffer(ab);
}
export async function readXlsxFromFile(file: File): Promise<any[]> {
  const ab = await file.arrayBuffer();
  return await readSheetFromArrayBuffer(ab);
}

/* -------------------------- Mappers ----------------------------- */
export function mapSpondMembers(rows: any[]): SpondMember[] {
  return rows
	.map((r) => {
	  const lookup: Record<string, any> = {};
	  for (const k of Object.keys(r)) lookup[normLower(k)] = r[k];

	  // Exclude non-players
	  const memberType = String(lookup["member type"] || "").toLowerCase();
	  if (memberType && memberType !== "player") return null;

	  const first = lookup["member first name"] ?? lookup["firstname"] ?? "";
	  const last = lookup["member last name"] ?? lookup["surname"] ?? "";
	  const dob = toISODate(lookup["date of birth"]);

	  const groups = lookup["groups"] ?? "";
	  const subGroup = lookup["sub group"] ?? "";

	  const split = (val: string) =>
		String(val)
		  .split(/[,;/\n\r]+/)
		  .map((s) => s.trim())
		  .filter(Boolean);

	  const groupList = split(groups);
	  const subList = split(subGroup);

	  // 🧩 Base: start with Groups
	  let finalGroups = [...groupList];

	  // 🧩 Special case: Ignite — include sub groups too
	  if (groupList.some((g) => /ignite/i.test(g))) {
		finalGroups = Array.from(new Set([...groupList, ...subList]));
	  }

	  const squad = finalGroups.join(", ");

	  // 🏀 Clean Basketball Scotland number
	  const scotNoRaw =
		lookup["basketball scot no"] ??
		lookup["basketball scotland no"] ??
		lookup["basketball scotland number"] ??
		"";
	  const basketballScotNo = String(scotNoRaw || "").replace(/\D/g, "") || undefined;

	  return {
		firstName: String(first || ""),
		lastName: String(last || ""),
		dob,
		groups: String(groups || ""),
		subGroup: String(subGroup || ""),
		squad,
		basketballScotNo,
	  };
	})
	.filter((r): r is SpondMember => !!r);
}




export function mapFinance(rows: any[]): FinanceRow[] {
  if (!rows.length) return [];

  const temp: FinanceRow[] = rows.map((r) => {
	const lookup: Record<string, any> = {};
	for (const k of Object.keys(r)) lookup[normLower(k)] = r[k];

	const first =
	  lookup["participant first name"] ??
	  lookup["first name"] ??
	  lookup["firstname"] ??
	  "";
	const last =
	  lookup["participant last name"] ??
	  lookup["last name"] ??
	  lookup["surname"] ??
	  "";
	const dob = toISODate(
	  lookup["date of birth"] ?? lookup["dob"] ?? lookup["birth date"]
	);

	// Paid Amount may be "£96.00", "96", etc.
	const paidKey =
	  ["paid amount", "amount", "total paid", "paid"].find((k) => k in lookup) ?? "";
	const paidRaw = String(lookup[paidKey] ?? "0").replace(/[£,]/g, "");
	const paidAmount = parseFloat(paidRaw) || 0;

	return {
	  firstName: String(first || ""),
	  lastName: String(last || ""),
	  dob,
	  paidAmount,
	};
  });

  // 🔢 Merge duplicates by (name + dob)
  const mergedMap = new Map<string, FinanceRow>();

  for (const f of temp) {
	const key = nameDobKey(f.firstName, f.lastName, f.dob);
	if (!mergedMap.has(key)) {
	  mergedMap.set(key, { ...f });
	} else {
	  mergedMap.get(key)!.paidAmount += f.paidAmount;
	}
  }

  return Array.from(mergedMap.values());
}

export function mapJustGo(rows: any[]): JustGoRow[] {
  return rows.map((r) => {
	const lookup: Record<string, any> = {};
	for (const k of Object.keys(r)) lookup[normLower(k)] = r[k];

	const MID = String(lookup["mid"] ?? lookup["membership id"] ?? "")
	  .replace(/\D/g, "")
	  .trim();

	const first =
	  lookup["firstname"] ?? lookup["first name"] ?? lookup["member first name"] ?? "";
	const last =
	  lookup["surname"] ?? lookup["last name"] ?? lookup["member last name"] ?? "";
	const dob = toISODate(lookup["dob"] ?? lookup["date of birth"]);
	const status = lookup["club member status"] ?? lookup["status"] ?? "";
	const expiry = toISODate(lookup["expiry date"] ?? lookup["expires"]);

	return {
	  MID: MID || undefined,
	  firstName: String(first || ""),
	  lastName: String(last || ""),
	  dob,
	  clubMemberStatus: String(status || ""),
	  expiryDate: expiry,
	};
  });
}

/* -------------------- Comparison + CSV -------------------------- */
export function isMembershipActive(j: JustGoRow, todayISO: string): boolean {
  if (!j) return false;
  const isActive = String(j.clubMemberStatus || "").toLowerCase() === "active";
  const notExpired = !j.expiryDate || j.expiryDate >= todayISO;
  return isActive && notExpired;
}

// --- helper: split squads into clean individual ones
function splitSquads(s: string): string[] {
  return (s || "")
	.split(/[,;/]+/)
	.map((v) => v.trim())
	.filter(Boolean);
}

export function buildComparison(
  members: SpondMember[],
  finances: FinanceRow[],
  justgo: JustGoRow[],
  minPaid = 100
): ComparisonRow[] {
  const todayISO = new Date().toISOString().slice(0, 10);

  const byMID = new Map<string, JustGoRow>();
  const byNameDOB = new Map<string, JustGoRow[]>();
  const byName = new Map<string, JustGoRow[]>();

  for (const j of justgo) {
	if (j.MID) byMID.set(j.MID, j);
	const kNd = nameDobKey(j.firstName, j.lastName, j.dob);
	if (!byNameDOB.has(kNd)) byNameDOB.set(kNd, []);
	byNameDOB.get(kNd)!.push(j);

	const kN = nameKey(j.firstName, j.lastName);
	if (!byName.has(kN)) byName.set(kN, []);
	byName.get(kN)!.push(j);
  }

  const paidByNameDOB = new Map<string, number>();
  const paidByName = new Map<string, number>();

  for (const f of finances) {
	const amt = f.paidAmount || 0;
	const kNd = nameDobKey(f.firstName, f.lastName, f.dob);
	paidByNameDOB.set(kNd, Math.max(amt, paidByNameDOB.get(kNd) || 0));

	const kN = nameKey(f.firstName, f.lastName);
	paidByName.set(kN, Math.max(amt, paidByName.get(kN) || 0));
  }

  const out: ComparisonRow[] = [];

  for (const m of members) {
	const displayName = `${m.firstName} ${m.lastName}`.trim();
	const rawSquad = m.subGroup || m.groups || "";
	const split = splitSquads(rawSquad);

	let paidAmt = 0;
	const kPaidDOB = nameDobKey(m.firstName, m.lastName, m.dob);
	if (paidByNameDOB.has(kPaidDOB)) paidAmt = paidByNameDOB.get(kPaidDOB)!;
	const kPaid = nameKey(m.firstName, m.lastName);
	if (paidByName.has(kPaid)) paidAmt = Math.max(paidAmt, paidByName.get(kPaid)!);
	const spondPaid = paidAmt > minPaid;

	let membership: JustGoRow | undefined;
	let matchMethod: ComparisonRow["matchMethod"] = "UNMATCHED";

	const midClean = (m.basketballScotNo || "").replace(/\D/g, "");
	if (midClean && byMID.has(midClean)) {
	  membership = byMID.get(midClean);
	  matchMethod = "MID";
	} else if (m.dob && byNameDOB.has(nameDobKey(m.firstName, m.lastName, m.dob))) {
	  membership = byNameDOB.get(nameDobKey(m.firstName, m.lastName, m.dob))![0];
	  matchMethod = "NAME_DOB";
	} else if (byName.has(nameKey(m.firstName, m.lastName))) {
	  membership = byName.get(nameKey(m.firstName, m.lastName))![0];
	  matchMethod = "NAME_ONLY";
	}

	const hasMembership = membership ? isMembershipActive(membership, todayISO) : false;

	// For each squad entry, push a separate row
	const squads = split.length ? split : [""];
	for (const squad of squads) {
	  out.push({
		name: displayName,
		squad,
		spondPaid,
		paidAmount: paidAmt,
		hasMembership,
		membershipStatus: membership?.clubMemberStatus,
		membershipExpiry: membership?.expiryDate,
		matchMethod,
	  });
	}
  }

  return out.sort(
	(a, b) =>
	  (a.squad || "").localeCompare(b.squad || "") ||
	  a.name.localeCompare(b.name)
  );
}

export function toCSV(rows: ComparisonRow[]): string {
  const header = [
	"Name",
	"Squad",
	"Paid (Amount)",
	"Membership Active",
	"Membership Status",
	"Membership Expiry",
	"Match Method",
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
	const line = [
	  r.name,
	  r.squad || "",
	  r.spondPaid ? `YES (${r.paidAmount})` : `NO (${r.paidAmount})`,
	  r.hasMembership ? "YES" : "NO",
	  r.membershipStatus || "",
	  r.membershipExpiry || "",
	  r.matchMethod,
	]
	  .map((v) => `"${String(v).replace(/"/g, '""')}"`)
	  .join(",");
	lines.push(line);
  }
  return lines.join("\n");
}
