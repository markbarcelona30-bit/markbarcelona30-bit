import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const login = process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;
if (!login || !token) throw new Error('GITHUB_REPOSITORY_OWNER and GITHUB_TOKEN are required.');
const now = new Date();
const from = new Date(now.getTime() - 31 * 86400000);
const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'User-Agent':'profile-activity-graph' },
  body: JSON.stringify({
    query: `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`,
    variables: { login, from:from.toISOString(), to:now.toISOString() },
  }),
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`Contribution request failed: HTTP ${response.status}`);
const result = await response.json();
if (result.errors?.length) throw new Error(`Contribution request failed: ${result.errors.map(e=>e.message).join('; ')}`);
const weeks = result.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
if (!Array.isArray(weeks)) throw new Error('GitHub returned no contribution calendar.');
const days = weeks.flatMap(w=>w.contributionDays)
  .filter(d=>d.date>=from.toISOString().slice(0,10)&&d.date<=now.toISOString().slice(0,10))
  .sort((a,b)=>a.date.localeCompare(b.date)).slice(-31);
if (days.length < 2 || days.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isInteger(d.contributionCount) || d.contributionCount < 0)) {
  throw new Error('GitHub returned incomplete or invalid contribution data.');
}

const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const total = days.reduce((sum,d)=>sum+d.contributionCount,0);
const ceiling = Math.max(4,Math.ceil(Math.max(...days.map(d=>d.contributionCount))/4)*4);
const x = i => 76 + i * 1056 / (days.length-1);
const y = value => 226 - value * 130 / ceiling;
const points = days.map((d,i)=>`${x(i).toFixed(1)},${y(d.contributionCount).toFixed(1)}`).join(' ');
const path = `M${points.replaceAll(' ','L').replaceAll(',',' ')}L1132 226L76 226Z`;
const updated = new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'Asia/Manila'}).format(now);
const dateLabel = date => new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
const directory = fileURLToPath(new URL('../assets/',import.meta.url));
await mkdir(directory,{recursive:true});
const outputs = [];
for (const theme of ['dark','light']) {
  const c = theme==='dark' ? {bg:'#0a101f',text:'#a78bfa',muted:'#91a4bf',line:'#22d3ee',grid:'#22334c',point:'#c4b5fd'} : {bg:'#f8fafc',text:'#7c3aed',muted:'#53647c',line:'#087e96',grid:'#d3ddeb',point:'#7c3aed'};
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="310" viewBox="0 0 1200 310" role="img" aria-labelledby="title desc">
<title id="title">${escape(login)} — recent contribution activity</title><desc id="desc">${total} contributions across ${days.length} days, ${days[0].date} to ${days.at(-1).date}. Updated ${updated}.</desc>
<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${c.line}" stop-opacity=".28"/><stop offset="1" stop-color="${c.line}" stop-opacity=".02"/></linearGradient></defs>
<rect width="1200" height="310" rx="14" fill="${c.bg}"/>
<g font-family="ui-monospace, SFMono-Regular, Consolas, monospace">
<text x="34" y="40" font-size="21" font-weight="700" fill="${c.text}">Contribution activity</text>
<text x="1166" y="40" text-anchor="end" font-size="14" fill="${c.muted}">${total} contributions / ${days.length} days</text>
${[0,1,2,3,4].map(i=>{const value=ceiling*i/4;return `<path d="M76 ${y(value)}H1132" stroke="${c.grid}"/><text x="61" y="${y(value)+5}" text-anchor="end" font-size="12" fill="${c.muted}">${value}</text>`;}).join('')}
<path d="${path}" fill="url(#area)"/><polyline points="${points}" fill="none" stroke="${c.line}" stroke-width="2.5" stroke-linejoin="round"/>
${days.map((d,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(d.contributionCount).toFixed(1)}" r="3.3" fill="${c.point}"><title>${d.date}: ${d.contributionCount} contributions</title></circle>`).join('')}
${days.flatMap((d,i)=>i%7===0||i===days.length-1?[`<text x="${x(i).toFixed(1)}" y="252" text-anchor="middle" font-size="12" fill="${c.muted}">${dateLabel(d.date)}</text>`]:[]).join('')}
<text x="34" y="288" font-size="11" fill="${c.muted}">Updated ${updated} · GitHub contribution calendar</text>
</g></svg>`;
  outputs.push([`${directory}activity-${theme}.svg`,svg]);
}
await Promise.all(outputs.map(([path,svg])=>writeFile(path,svg)));
console.log(`Generated activity graphs for ${login}: ${days.length} days, ${total} contributions.`);
