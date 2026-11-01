import {hash,tokens,buildIndex} from './index.mjs';

const textHash = text => hash(tokens(text).join(' '));
function grams(text) {
  const ts=tokens(text), set=new Set();
  for(let i=0;i<ts.length-4;i++)set.add(ts.slice(i,i+5).join(' '));
  return set;
}
function similarity(a,b) {
  if(!a.size||!b.size)return 0;
  let common=0; for(const x of a)if(b.has(x))common++;
  return common/(a.size+b.size-common);
}
export function prepareContentDataset(records, index, {asOf=new Date().toISOString(),minExamples=50}={}) {
  if(!Number.isFinite(Date.parse(asOf))||!Number.isInteger(minExamples)||minExamples<50)throw new Error('Valid asOf and minimum of at least50examples required');
  if(buildIndex(index.sources).corpusHash!==index.corpusHash)throw new Error('Source registry checksum mismatch');
  if(!Array.isArray(records)||records.length>10000)throw new Error('Expected at most 10000 reviewed content examples');
  const accepted=[], allRecords=[], seen=new Map(), ids=new Set(), duplicates=[], lengths=[], duplicateLinks=[];
  for(const [i,r] of records.entries()) {
    for(const key of ['id','groupId','sourcePostId','productId','promotionKey','instruction','response'])if(typeof r[key]!=='string'||!r[key].trim())throw new Error(`Example ${i}: missing ${key}`);
    if(ids.has(r.id))throw new Error(`Duplicate example id ${r.id}`); ids.add(r.id);
    if(r.consentForTraining!==true||r.labelKind!=='editorial_approved'||r.review?.approved!==true||!r.review.reviewer||!Number.isFinite(Date.parse(r.review.reviewedAt)))throw new Error(`Example ${r.id}: explicit training consent and human editorial approval required; performance winners are not inferred`);
    if(Date.parse(r.review.reviewedAt)>Date.parse(asOf))throw new Error(`Example ${r.id}: future review`);
    if(!Array.isArray(r.sourceIds)||!r.sourceIds.length)throw new Error(`Example ${r.id}: sourceIds required`);
    for(const id of r.sourceIds) {
      const s=index.sources.find(s=>s.sourceId===id);
      if(!s||s.productId!==r.productId||(s.promotionKey!=='*'&&s.promotionKey!==r.promotionKey)||Date.parse(s.validFrom)>Date.parse(asOf)||Date.parse(s.verifiedAt)>Date.parse(asOf)||Date.parse(asOf)-Date.parse(s.verifiedAt)>168*3600000||(s.validTo&&Date.parse(s.validTo)<=Date.parse(asOf)))throw new Error(`Example ${r.id}: incompatible, stale or expired source ${id}`);
    }
    const text=`${r.instruction}\n${r.response}`;
    if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?84|0)(?:[ .-]?\d){9,10}\b/i.test(text))throw new Error(`Example ${r.id}: possible personal contact information`);
    const length=tokens(text).length; if(length<15||length>1200)throw new Error(`Example ${r.id}: content length outside 15–1200 lexical tokens`);
    const key=textHash(r.response), g=grams(r.response), entry={...r,grams:g,index:allRecords.length};
    allRecords.push(entry);
    const duplicate=seen.get(key)??accepted.find(a=>similarity(g,a.grams)>=0.8);
    if(duplicate){duplicates.push(r.id);duplicateLinks.push([entry.index,duplicate.index]);continue;}
    seen.set(key,entry); lengths.push(length); accepted.push(entry);
  }
  // Preserve family/post connections from removed duplicates: they can bridge surviving groups.
  const parent=allRecords.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
  const union=(a,b)=>{parent[find(a)]=find(b);},family=new Map(),posts=new Map();
  for(const r of allRecords)for(const [key,map] of [[r.groupId,family],[r.sourcePostId,posts]]) {
    if(map.has(key))union(r.index,map.get(key));else map.set(key,r.index);
  }
  for(const [a,b] of duplicateLinks)union(a,b);
  const groups=new Map();accepted.forEach(r=>{const k=find(r.index);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});
  const ordered=[...groups.values()].sort((a,b)=>hash(a.map(r=>r.id).sort()).localeCompare(hash(b.map(r=>r.id).sort())));
  const heldoutGroups=Math.max(1,Math.ceil(ordered.length*0.2));
  const validationGroups=Math.max(1,Math.ceil(ordered.length*0.1));
  const heldout=ordered.slice(0,heldoutGroups).flat(),validation=ordered.slice(heldoutGroups,heldoutGroups+validationGroups).flat(),train=ordered.slice(heldoutGroups+validationGroups).flat();
  const serialize=r=>({id:r.id,groupId:r.groupId,sourcePostId:r.sourcePostId,productId:r.productId,promotionKey:r.promotionKey,sourceIds:r.sourceIds,
    messages:[{role:'system',content:'Viết nội dung tiếng Việt theo sự kiện đã xác minh. Không bịa giá, công dụng, chứng nhận, lời chứng thực hoặc kết quả.'},
      {role:'user',content:`${r.instruction}\n\nNguồn dữ liệu đã xác minh:\n${r.sourceIds.map(id=>{const s=index.sources.find(s=>s.sourceId===id);return `[${id}] ${s.text}`;}).join('\n')}`},
      {role:'assistant',content:r.response}],
    review:r.review,consentForTraining:true,labelKind:r.labelKind});
  const blockers=[];
  if(accepted.length<minExamples)blockers.push(`Need at least ${minExamples} distinct human-approved examples; have ${accepted.length}`);
  if(groups.size<10)blockers.push(`Need at least 10 independent story/post groups; have ${groups.size}`);
  if(heldout.length<5||validation.length<5||train.length<40)blockers.push('Need at least 40 training, 5 validation and 5 held-out examples after group split');
  const dataset={train:train.map(serialize),validation:validation.map(serialize),heldout:heldout.map(serialize)};
  return {...dataset,manifest:{version:1,datasetHash:hash(dataset),corpusHash:index.corpusHash,createdAt:asOf,ready:blockers.length===0,blockers,
    counts:{input:records.length,accepted:accepted.length,duplicates:duplicates.length,groups:groups.size,train:train.length,validation:validation.length,heldout:heldout.length},duplicateIds:duplicates,
    lexicalTokenHistogram:{under128:lengths.filter(n=>n<128).length,from128to511:lengths.filter(n=>n>=128&&n<512).length,from512:lengths.filter(n=>n>=512).length},
    note:'Lexical token counts are preflight only; actual model-token lengths are checked before training. Editorial approval is not an attributed performance label.'}};
}
