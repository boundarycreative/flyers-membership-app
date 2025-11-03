<script lang="ts">
  import {
	readXlsxFromFetch,
	readXlsxFromFile,
	mapSpondMembers,
	mapFinance,
	mapJustGo,
	buildComparison,
	toCSV,
	type ComparisonRow,
	type SpondMember
  } from "$lib/xlsxUtils";

  import { onMount } from "svelte";

  let unlocked = false;
  let passwordInput = "";
  const PASSWORD = "flyers2025"; // 🔐 simple password

  let comparison: ComparisonRow[] = [];
  let squads: string[] = [];
  let membersCache: SpondMember[] = [];

  let loading = true;
  let errorMsg = "";
  let selectedSquad = "";
  let search = "";
  let showOnlyIssues = false;
  let minPaid = 40;

  let membersFile: File | null = null;
  let justgoFile: File | null = null;
  let financeFiles: File[] = [];

  onMount(() => {
	if (unlocked) loadDefaultData();
  });

  /* -------------------- Squad computation -------------------- */
  function computeSquadsFromMembers(members: SpondMember[]) {
	const set = new Set<string>();

	const addAll = (val?: string) => {
	  if (!val) return;
	  String(val)
		.split(/[,;/\n\r]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.forEach((g) => set.add(g));
	};

	for (const m of members) {
	  addAll(m.groups);
	  addAll(m.subGroup);
	}

	return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  /* -------------------- Data loaders -------------------- */
  async function loadDefaultData() {
	loading = true;
	errorMsg = "";
	try {
	  const spondRaw = await readXlsxFromFetch("/data/Spond/members.xlsx");
	  const members = mapSpondMembers(spondRaw);
	  membersCache = members;
	  squads = computeSquadsFromMembers(membersCache);

	  const justGoRaw = await readXlsxFromFetch("/data/JustGo/basketballscotland.xlsx");
	  const justgo = mapJustGo(justGoRaw);

	  let financeList: string[] = [];
	  try {
		const idx = await (await fetch("/data/Spond/Finance/index.json")).json();
		financeList = idx.financeFiles || [];
	  } catch {
		financeList = ["u10s.xlsx", "u12s.xlsx"];
	  }

	  const allFinanceRows = [];
	  for (const f of financeList) {
		const raw = await readXlsxFromFetch(`/data/Spond/Finance/${f}`);
		allFinanceRows.push(...mapFinance(raw));
	  }

	  comparison = buildComparison(members, allFinanceRows, justgo, minPaid);
	} catch (e: any) {
	  errorMsg = e?.message || String(e);
	} finally {
	  loading = false;
	}
  }

  async function rebuildWithUploads() {
	loading = true;
	errorMsg = "";
	try {
	  const spondRaw = membersFile
		? await readXlsxFromFile(membersFile)
		: await readXlsxFromFetch("/data/Spond/members.xlsx");
	  const members = mapSpondMembers(spondRaw);
	  membersCache = members;
	  squads = computeSquadsFromMembers(membersCache);

	  const justGoRaw = justgoFile
		? await readXlsxFromFile(justgoFile)
		: await readXlsxFromFetch("/data/JustGo/basketballscotland.xlsx");
	  const justgo = mapJustGo(justGoRaw);

	  const allFinanceRows = [];
	  if (financeFiles.length) {
		for (const f of financeFiles) {
		  const raw = await readXlsxFromFile(f);
		  allFinanceRows.push(...mapFinance(raw));
		}
	  } else {
		let financeList: string[] = [];
		try {
		  const idx = await (await fetch("/data/Spond/Finance/index.json")).json();
		  financeList = idx.financeFiles || [];
		} catch {
		  financeList = ["u10s.xlsx", "u12s.xlsx"];
		}
		for (const f of financeList) {
		  const raw = await readXlsxFromFetch(`/data/Spond/Finance/${f}`);
		  allFinanceRows.push(...mapFinance(raw));
		}
	  }

	  comparison = buildComparison(members, allFinanceRows, justgo, minPaid);
	} catch (e: any) {
	  errorMsg = e?.message || String(e);
	} finally {
	  loading = false;
	}
  }

  /* -------------------- Upload handlers -------------------- */
  function onUploadMembers(e: Event) {
	membersFile = (e.target as HTMLInputElement).files?.[0] || null;
	rebuildWithUploads();
  }

  function onUploadJustGo(e: Event) {
	justgoFile = (e.target as HTMLInputElement).files?.[0] || null;
	rebuildWithUploads();
  }

  function onUploadFinance(e: Event) {
	financeFiles = Array.from((e.target as HTMLInputElement).files || []);
	rebuildWithUploads();
  }

  /* -------------------- Filters -------------------- */
function filterRows() {
	const term = search.trim().toLowerCase();
  
	return comparison.filter((r) => {
	  const normalize = (s: string) =>
		String(s || "").trim().toLowerCase();
  
	  // Combine all group-related text fields into one big lowercase string
	  const combinedGroups = [
		r.squad,
		(r as any).groups,
		(r as any).subGroup
	  ]
		.map((s) => normalize(s))
		.filter(Boolean)
		.join(" | "); // safe separator for matching
  
	  // ✅ If a squad is selected, check if it's *contained* in that combined text
	  if (selectedSquad && !combinedGroups.includes(normalize(selectedSquad))) {
		return false;
	  }
  
	  // ✅ Name search
	  if (term && !normalize(r.name).includes(term)) return false;
  
	  // ✅ Only issues toggle
	  if (showOnlyIssues && (r.spondPaid && r.hasMembership)) return false;
  
	  return true;
	});
  }

  /* -------------------- Export -------------------- */
  function exportCSV() {
	const csv = toCSV(filterRows());
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "membership_comparison.csv";
	a.click();
	URL.revokeObjectURL(url);
  }

  function checkPassword() {
	if (passwordInput === PASSWORD) {
	  unlocked = true;
	  loadDefaultData();
	} else {
	  alert("Incorrect password");
	}
  }
</script>

<!-- ====================== UI ====================== -->
{#if !unlocked}
  <div class="min-h-screen flex flex-col items-center justify-center bg-base-200">
	<div class="card w-96 bg-base-100 shadow-xl">
	  <div class="card-body">
		<h2 class="card-title mb-4">Member Checker Login</h2>
		<input
		  type="password"
		  placeholder="Enter password"
		  bind:value={passwordInput}
		  class="input input-bordered w-full mb-4"
		  on:keydown={(e) => e.key === 'Enter' && checkPassword()}
		/>
		<button class="btn btn-primary w-full" on:click={checkPassword}>
		  Access
		</button>
	  </div>
	</div>
  </div>
{:else}
  <div class="p-6 space-y-6">
	<!-- Upload Section -->
	<div class="card bg-base-100 shadow-md">
	  <div class="card-body">
		<h2 class="card-title mb-2">Upload Data Files</h2>
		<div class="grid md:grid-cols-3 gap-4">
		  <div>
			<label class="label"><span class="label-text font-semibold">Spond Members</span></label>
			<input type="file" accept=".xlsx" on:change={onUploadMembers} class="file-input file-input-bordered w-full" />
		  </div>
		  <div>
			<label class="label"><span class="label-text font-semibold">Basketball Scotland (JustGo)</span></label>
			<input type="file" accept=".xlsx" on:change={onUploadJustGo} class="file-input file-input-bordered w-full" />
		  </div>
		  <div>
			<label class="label"><span class="label-text font-semibold">Spond Finance Files</span></label>
			<input type="file" multiple accept=".xlsx" on:change={onUploadFinance} class="file-input file-input-bordered w-full" />
		  </div>
		</div>
	  </div>
	</div>

	<!-- Filters -->
	<div class="card bg-base-100 shadow-sm">
	  <div class="card-body">
		<h2 class="card-title mb-2">Filters</h2>
		<div class="flex flex-wrap items-end gap-4">
		  <div>
			<label class="label"><span class="label-text">Squad</span></label>
			<select bind:value={selectedSquad} class="select select-bordered">
			  <option value="">All squads</option>
			  {#each squads as s}<option value={s}>{s}</option>{/each}
			</select>
		  </div>

		  <div class="flex-1 min-w-[220px]">
			<label class="label"><span class="label-text">Search Name</span></label>
			<input bind:value={search} type="text" placeholder="e.g. Joe Bloggs" class="input input-bordered w-full" />
		  </div>

		  <div class="flex items-center gap-2 mt-6">
			<input id="issues" type="checkbox" bind:checked={showOnlyIssues} class="checkbox checkbox-sm" />
			<label for="issues" class="label-text">Show only issues</label>
		  </div>

		  <div class="ml-auto flex gap-2 mt-6">
			<button on:click={exportCSV} class="btn btn-outline btn-sm">Export CSV</button>
			<button on:click={rebuildWithUploads} class="btn btn-primary btn-sm">Recompute</button>
		  </div>
		</div>
	  </div>
	</div>

	<!-- Data Table -->
	{#if loading}
	  <div role="alert" class="alert alert-info"><span>Loading data...</span></div>
	{:else if errorMsg}
	  <div role="alert" class="alert alert-error"><span>{errorMsg}</span></div>
	{:else}
	  <div class="overflow-x-auto shadow-md rounded-lg">
		<table class="table table-zebra w-full text-sm">
		  <thead>
			<tr>
			  <th>Name</th>
			  <th>Squad</th>
			  <th>Spond Paid</th>
			  <th>Paid Amount</th>
			  <th>JustGo Active</th>
			  <th>Status</th>
			  <th>Expiry</th>
			  <th>Matched By</th>
			</tr>
		  </thead>
		  <tbody>
			{#each filterRows() as r}
			 <tr
			   class={
				 r.name.includes(" PU")
				   ? "bg-blue-50" // 💙 surname contains " PU"
				   : (r.spondPaid &&
					   r.membershipExpiry &&
					   new Date(r.membershipExpiry) >= new Date())
				   ? "bg-green-50" // ✅ fully cleared
				   : (!r.spondPaid ||
					  !r.membershipExpiry ||
					  new Date(r.membershipExpiry) < new Date())
				   ? "bg-red-50" // ❌ missing payment or membership
				   : ""
			   }
			 >
				<td>{r.name}</td>
				<td>{r.squad}</td>
				<td>{r.spondPaid ? '✅' : '❌'}</td>
				<td>£{r.paidAmount}</td>
				<td>{r.membershipExpiry && new Date(r.membershipExpiry) >= new Date() ? '✅' : '❌'}</td>
				<td>{r.membershipStatus || '-'}</td>
				<td>{r.membershipExpiry || '-'}</td>
				<td>{r.matchMethod}</td>
			  </tr>
			{/each}
		  </tbody>
		</table>
	  </div>

	  <p class="text-sm text-gray-600 mt-2">
		Showing {filterRows().length} of {comparison.length} records.
	  </p>
	{/if}
  </div>
{/if}
