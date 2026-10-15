import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const login = process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;
if (!login || !token) throw new Error('GITHUB_REPOSITORY_OWNER and GITHUB_TOKEN are required.');
const headers = { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'User-Agent':'profile-stats' };
async function github(path, options={}) {
  const response = await fetch(`https://api.github.com/${path}`, { ...options, headers:{...headers,...options.headers}, signal:AbortSignal.timeout(30000) });
  if(!response.ok) throw new Error(`GitHub stats request failed: HTTP ${response.status}`);
  return response.json();
}
const repos = [];
for(let page=1;;page++) {
  const batch = await github(`users/${encodeURIComponent(login)}/repos?type=owner&sort=full_name&direction=asc&per_page=100&page=${page}`);
  if(!Array.isArray(batch)) throw new Error('GitHub returned an invalid repository list.');
  repos.push(...batch.filter(repo=>!repo.fork&&!repo.private));
  if(batch.length<100) break;
}
const now = new Date();
const from = new Date(now); from.setUTCFullYear(from.getUTCFullYear()-1);
const profile = await github('graphql', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    query:`query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){pullRequests{totalCount} issues{totalCount} contributionsCollection(from:$from,to:$to){totalCommitContributions totalRepositoriesWithContributedCommits}}}`,
    variables:{login,from:from.toISOString(),to:now.toISOString()},
  }),
});
if(profile.errors?.length) throw new Error(`GitHub stats query failed: ${profile.errors.map(e=>e.message).join('; ')}`);
const user = profile.data?.user;
const values = [
  ['Total stars earned',repos.reduce((total,repo)=>total+repo.stargazers_count,0)],
  ['Commits (last year)',user?.contributionsCollection?.totalCommitContributions],
  ['Total PRs',user?.pullRequests?.totalCount],
  ['Total issues',user?.issues?.totalCount],
  ['Repos with commits (last year)',user?.contributionsCollection?.totalRepositoriesWithContributedCommits],
];
if(values.some(([,value])=>!Number.isInteger(value)||value<0)) throw new Error('GitHub returned invalid statistics.');
const languages = new Map();
for(let offset=0;offset<repos.length;offset+=4) {
  const results = await Promise.all(repos.slice(offset,offset+4).map(repo=>github(`repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}/languages`)));
  for(const result of results) for(const [name,bytes] of Object.entries(result)) {
    if(!Number.isInteger(bytes)||bytes<0) throw new Error('GitHub returned invalid language sizes.');
    languages.set(name,(languages.get(name)??0)+bytes);
  }
}
const ranked = [...languages].filter(([,bytes])=>bytes>0).sort((a,b)=>b[1]-a[1]);
const totalBytes = ranked.reduce((total,[,bytes])=>total+bytes,0);
const displayed = ranked.slice(0,7);
if(ranked.length>7) displayed.push(['Other',ranked.slice(7).reduce((total,[,bytes])=>total+bytes,0)]);
const colors = { TypeScript:'#3178c6', JavaScript:'#f1e05a', HTML:'#e34c26', CSS:'#663399', Python:'#3572a5', Java:'#b07219', Shell:'#89e051', Go:'#00add8', Ruby:'#701516', Vue:'#41b883', Other:'#8b949e' };
const escape = text=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const updated = new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'Asia/Manila'}).format(now);
const icons = [
  '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.2 9.6l6.3-.9Z"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v10m4-12h3a5 5 0 0 1 5 5v7m-8-12 3-3m-3 3 3 3"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
  '<path d="M4 3h15v18l-5-3-5 3V3m-5 0v18m8-13h4m-4 4h4"/>',
];
const directory = fileURLToPath(new URL('../assets/',import.meta.url));
await mkdir(directory,{recursive:true});
const outputs=[];
for(const theme of ['dark','light']) {
  const c = theme==='dark'?{bg:'#0a101f',title:'#22d3ee',text:'#91a4bf',value:'#f0f6fc',icon:'#a78bfa'}:{bg:'#f8fafc',title:'#087e96',text:'#53647c',value:'#0f172a',icon:'#7c3aed'};
  let offset=0;
  const bar=displayed.map(([name,bytes])=>{const width=520*bytes/totalBytes;const result=`<rect x="${(640+offset).toFixed(2)}" y="76" width="${width.toFixed(2)}" height="15" fill="${colors[name]??c.icon}"/>`;offset+=width;return result;}).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="310" viewBox="0 0 1200 310" role="img" aria-labelledby="title desc">
<title id="title">Mark Medina's GitHub Stats and Most Used Languages</title><desc id="desc">${values.map(([label,value])=>`${escape(label)}: ${value}.`).join(' ')} Languages are measured by code bytes across public owned repositories, excluding forks. Updated ${updated}.</desc>
<defs><clipPath id="language-bar"><rect x="640" y="76" width="520" height="15" rx="7.5"/></clipPath></defs>
<rect width="592" height="310" rx="12" fill="${c.bg}"/><rect x="608" width="592" height="310" rx="12" fill="${c.bg}"/>
<g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif">
<text x="28" y="40" fill="${c.title}" font-size="22" font-weight="600">Mark Medina's GitHub Stats</text>
${values.map(([label,value],i)=>`<svg x="28" y="${69+i*36}" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="${c.icon}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</svg><text x="62" y="${85+i*36}" font-size="17" fill="${c.text}" font-weight="600">${escape(label)}</text><text x="550" y="${85+i*36}" text-anchor="end" font-size="19" font-weight="600" fill="${c.value}">${value.toLocaleString('en')}</text>`).join('')}
<text x="640" y="40" fill="${c.title}" font-size="22" font-weight="600">Most Used Languages</text>
${totalBytes?`<g clip-path="url(#language-bar)">${bar}</g>${displayed.map(([name,bytes],i)=>{const x=640+(i%2)*260,y=126+Math.floor(i/2)*31;return `<circle cx="${x+5}" cy="${y-5}" r="5" fill="${colors[name]??c.icon}"/><text x="${x+18}" y="${y}" fill="${c.text}" font-size="14">${escape(name)} ${(100*bytes/totalBytes).toFixed(2)}%</text>`;}).join('')}`:`<text x="640" y="126" fill="${c.text}" font-size="17">No language data yet</text>`}
<text x="28" y="286" fill="${c.text}" font-size="12">Updated ${updated} · GitHub activity</text>
<text x="640" y="286" fill="${c.text}" font-size="12">Public repositories · by code size · excludes forks</text>
</g></svg>`;
  outputs.push([`${directory}stats-${theme}.svg`,svg]);
}
await Promise.all(outputs.map(([path,svg])=>writeFile(path,svg)));
console.log(`Generated profile stats from ${repos.length} public non-fork repositories and ${ranked.length} languages.`);
