import './style.css';

const sampleKeys = {
 client: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
 maker: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
 mediator: '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
};
let currentPlan = null;
let generation = 0;
const app = document.querySelector('#app');
app.innerHTML = `<header><a class="brand" href="/">W<span>O</span> / WorkOrder</a><span class="network">LOCAL PLANNER · PUBLIC PARAMETERS ONLY</span><a href="https://github.com/solidcash/solidcash" target="_blank" rel="noreferrer">Built with SolidCash ↗</a></header>
<main><aside><span class="eyebrow">A FAIR FINISH</span><h1>Good work.<br>A clear way<br>to get paid.</h1><p>Agree on a deliverable, reserve the BCH, and give both sides a defined way to finish.</p><div class="note"><b>Review the actual contract.</b><p>Enter the agreed public keys and terms. The local compiler derives the escrow address and exact payout scripts for your transaction plan.</p></div><ol><li class="done">Agree on terms</li><li>Review the plan</li><li>Check the funding output</li><li>Sign with your own tools</li></ol></aside>
<section><div class="card-heading"><div><span class="eyebrow">WORK ORDER / TRANSACTION REVIEW</span><h2>A clear agreement.<br>Every payout accounted for.</h2></div><span class="badge">Offline terms</span></div><p class="sample-warning">The prefilled public keys are publicly known examples. Never send funds to a sample address. Replace all three keys with your agreed public keys. This planner accepts no private keys.</p>
<form id="terms"><details class="parameters" open><summary>Agreed public keys</summary><div class="key-fields">${Object.entries(sampleKeys).map(([role,key])=>`<label>${role[0].toUpperCase()+role.slice(1)} compressed public key<input name="${role}" value="${key}" required pattern="(02|03)[0-9a-fA-F]{64}" autocomplete="off" spellcheck="false"></label>`).join('')}</div></details>
<div class="term-grid"><label>Network<select name="network"><option value="chipnet">Chipnet</option><option value="mainnet">Mainnet — planning only</option></select></label><label>Escrow value (sats)<input name="inputSats" type="number" step="1" min="1" value="250000" required></label><label>Refund block<input name="refundHeight" type="number" step="1" min="1" max="499999999" value="936500" required></label><label>Fee cap (sats)<input name="feeCap" type="number" step="1" min="1" max="10000" value="1800" required></label><label>Planned fee (sats)<input name="feeSats" type="number" step="1" min="1" max="10000" value="1800" required></label><label>Current block (optional)<input name="currentHeight" type="number" step="1" min="0" max="499999999" placeholder="Not verified by planner"></label></div>
<details class="parameters"><summary>Funding output reference (optional)</summary><p>Use the exact funding transaction and output index. This local plan does not look up the chain.</p><div class="funding-fields"><label>Transaction ID<input name="txid" pattern="[0-9a-fA-F]{64}" autocomplete="off" spellcheck="false"></label><label>Output index<input name="vout" type="number" step="1" min="0" max="4294967295" placeholder="0"></label></div></details>
<h3>Choose a resolution</h3><div class="paths"><article><span>01 / APPROVE</span><h4>Deliver & release</h4><p>The client and maker sign. The maker receives the escrow less the chosen fee.</p><button type="submit" name="action" value="approve">Plan approval</button></article><article><span>02 / REFUND</span><h4>Recover unfinished work</h4><p>The client signs with the agreed locktime. A refund needs a later candidate block to become final.</p><button type="submit" name="action" value="refund" class="quiet">Plan refund</button></article></div>
<details><summary>Resolve a dispute with the mediator</summary><p>The mediator is trusted to choose the split. The contract pins both recipients, so the mediator cannot redirect the escrow to their own address. Each split payout needs at least 546 sats.</p><label>Maker award (sats)<input name="makerSats" type="number" step="1" min="546" value="148920"></label><button type="submit" name="action" value="resolve" class="quiet">Plan mediator split</button></details></form>
<div id="result" role="status">Generate a plan to see the compiled contract address, required signers, input reference, payout addresses, amounts and locktime.</div><div id="review" hidden><div class="review-heading"><h3>Transaction plan</h3><button id="download" class="quiet" type="button">Download JSON</button></div><dl id="overview"></dl><div class="table-wrap"><table><thead><tr><th>Output</th><th>Recipient & address</th><th>Satoshis</th></tr></thead><tbody id="outputs"></tbody></table></div><ul id="warnings"></ul><details><summary>Inspect the full plan</summary><pre id="json"></pre></details></div><footer>Locally compiled parameters · No network lookup · No signatures · No broadcast</footer></section></main>`;

const form = document.querySelector('#terms');
const result = document.querySelector('#result');
const cancellation = document.createElement('article');
cancellation.innerHTML = '<span>03 / CANCEL TOGETHER</span><h4>Unwind by agreement</h4><p>Client and maker can jointly return the escrow to the client immediately. No timeout or mediator is needed.</p><button type="submit" name="action" value="cancel" class="quiet">Plan mutual cancellation</button>';
form.querySelector('.paths').append(cancellation);
const localDemo = document.createElement('details');
localDemo.innerHTML = '<summary>Run the contract lifecycle locally</summary><p>Executes approval, mutual cancellation, timed refund and mediator split using publicly known fixture keys in the local BCH VM. It uses a separate example order, independent of your form. No blockchain transaction is broadcast.</p><button type="button" class="quiet">Run local VM example</button><pre role="status">No local execution yet.</pre>';
document.querySelector('section').append(localDemo);
localDemo.querySelector('button').addEventListener('click', async event => {
 const button = event.currentTarget, output = localDemo.querySelector('pre');
 button.disabled = true; output.textContent = 'Executing four isolated local spend paths…';
 try {
  const response = await fetch('/api/demo', { method:'POST' });
  const report = await response.json();
  if (!response.ok) throw new Error(report.error ?? 'Local VM execution failed.');
  output.textContent = JSON.stringify(report, null, 2);
 } catch (error) { output.textContent = error.message; }
 finally { button.disabled = false; }
});
form.addEventListener('input', () => {
 generation += 1; currentPlan = null;
 document.querySelector('#review').hidden = true;
 result.textContent = 'Terms changed. Generate a fresh plan before reviewing or exporting.';
});
form.addEventListener('submit', async event => {
 event.preventDefault();
 const ticket = ++generation;
 const data = Object.fromEntries(new FormData(form));
 data.action = event.submitter?.value ?? 'approve';
 currentPlan = null; document.querySelector('#review').hidden = true;
 result.textContent = 'Compiling the agreed terms locally…';
 try {
  const response = await fetch('/api/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  let plan;
  try { plan = await response.json(); } catch { throw new Error('The local compiler endpoint is unavailable. Start this project with npm run dev or npm run preview.'); }
  if (!response.ok) throw new Error(plan.error ?? 'Unable to generate plan.');
  if (ticket !== generation) return;
  currentPlan = plan;
  result.textContent = 'Plan generated from the compiled WorkOrder contract. Chain data remains unverified; no transaction has been created or sent.';
  const overview = document.querySelector('#overview'); overview.replaceChildren();
  for (const [label,value] of Object.entries({ Network:plan.network, Contract:plan.contractAddress, 'Required signers':plan.requiredSigners.join(' + '), 'Funding reference':plan.fundingReferenceComplete?`${plan.input.txid}:${plan.input.vout}`:'Not provided', 'Escrow satoshis':plan.input.satoshis, 'Miner fee (sats)':plan.feeSats, Locktime:plan.locktime, 'Redeem script':`${plan.redeemScriptBytes} bytes`, 'Redeem script SHA256':plan.redeemScriptSha256 })) {
   const dt=document.createElement('dt'); dt.textContent=label; const dd=document.createElement('dd'); dd.textContent=String(value); overview.append(dt,dd);
  }
  const rows=document.querySelector('#outputs'); rows.replaceChildren();
  for (const output of plan.outputs) {
   const row=document.createElement('tr');
   for (const text of [output.index,`${output.role}\n${output.address}`,output.satoshis]) {const cell=document.createElement('td');cell.textContent=String(text);row.append(cell)}
   rows.append(row);
  }
  const warnings=document.querySelector('#warnings');warnings.replaceChildren();
  for (const warning of plan.warnings) {const li=document.createElement('li');li.textContent=warning;warnings.append(li)}
  document.querySelector('#json').textContent=JSON.stringify(plan,null,2);
  document.querySelector('#review').hidden=false;
 } catch (error) {if(ticket===generation)result.textContent=error.message;}
});
document.querySelector('#download').addEventListener('click',()=>{
 if(!currentPlan)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(currentPlan,null,2)+'\n'],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`workorder-${currentPlan.network}-${currentPlan.action}-plan.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// ---- Lifecycle overview, live terms summary, review checklist (UI only; no contract/plan logic) ----
const lifecycle = document.createElement('div');
lifecycle.className = 'lifecycle';
lifecycle.setAttribute('role', 'group');
lifecycle.setAttribute('aria-label', 'Escrow lifecycle');
lifecycle.innerHTML = `<h3>How the escrow can end</h3>
<div class="state-start"><span class="state-tag">1 / FUND</span><b>Client funds the contract</b><p>Plain BCH only. Tokens are rejected and may become stuck.</p></div>
<ul class="state-list">
<li><span class="state-tag">APPROVE</span><b>Client + maker sign</b><p>Maker receives the escrow minus the fee.</p></li>
<li><span class="state-tag">CANCEL</span><b>Client + maker sign</b><p>Escrow returns to the client, no timeout needed.</p></li>
<li><span class="state-tag">MEDIATOR SPLIT</span><b>Mediator signs</b><p>Fixed client and maker payouts. Each needs at least 546 sats.</p></li>
<li><span class="state-tag">REFUND</span><b>Client signs after the refund block</b><p>Needs a locktime at or after the refund height.</p></li></ul>`;
form.before(lifecycle);

const summary = document.createElement('dl');
summary.className = 'terms-summary';
summary.setAttribute('aria-label', 'Current terms');
form.querySelector('.term-grid').before(summary);
const short = key => key && key.length > 20 ? `${key.slice(0, 10)}…${key.slice(-8)}` : key || 'not set';
const renderSummary = () => {
 const f = Object.fromEntries(new FormData(form));
 summary.replaceChildren();
 for (const [label, value] of [['Client key', short(f.client)], ['Maker key', short(f.maker)], ['Mediator key', short(f.mediator)], ['Fee cap', `${f.feeCap || '–'} sats`], ['Refund block', f.refundHeight || '–']]) {
  const box = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
  dt.textContent = label; dd.textContent = value; box.append(dt, dd); summary.append(box);
 }
};
form.addEventListener('input', renderSummary); renderSummary();

const review = document.querySelector('#review');
const download = document.querySelector('#download');
const checklist = document.createElement('fieldset');
checklist.className = 'checklist';
checklist.innerHTML = '<legend>Before you sign</legend>' + [
 'The contract address matches the one my counterparties derived independently.',
 'Every output address and amount is what we agreed, and the fee is within the cap.',
 'The funding transaction ID and output index are the exact plain-BCH UTXO.',
 'I will sign with my own tools. This planner has no signing or broadcast.',
].map((text, i) => `<label class="check"><input type="checkbox" data-check="${i}"> <span>${text}</span></label>`).join('');
review.querySelector('.review-heading').after(checklist);
const syncDownload = () => { download.disabled = ![...checklist.querySelectorAll('input')].every(box => box.checked); };
checklist.addEventListener('change', syncDownload);
new MutationObserver(() => { if (review.hidden) { checklist.querySelectorAll('input').forEach(box => { box.checked = false; }); syncDownload(); } }).observe(review, { attributes: true, attributeFilter: ['hidden'] });
syncDownload();
download.title = 'Tick every review item to enable export';
result.setAttribute('aria-live', 'polite');

const status = document.createElement('p');
status.className = 'status-line';
status.textContent = 'Status: local VM and regtest checks only. Chipnet lifecycle, BCH mainnet run and independent contract review are pending.';
document.querySelector('footer').before(status);
