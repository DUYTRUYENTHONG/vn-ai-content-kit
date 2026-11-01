import test from 'node:test';import assert from 'node:assert/strict';
import {prepareScript} from '../src/editorial.mjs';
import {buildIndex,createKnowledgePipeline} from '../src/knowledge/index.mjs';
test('script preparation preserves Vietnamese question cues and never approves speech',()=>{
 const r=prepareScript('  Có khách sắp ghé nhà chơi?\n\nMình chọn đúng nhu cầu. ');assert.equal(r.spokenText,'Có khách sắp ghé nhà chơi?\n\nMình chọn đúng nhu cầu.');assert.equal(r.publicationReady,false);
 const lexical=prepareScript('Tìm hiểu NhãnMẫu trước khi mua.',{pronunciations:[{display:'NhãnMẫu',spoken:'nhãn mẫu',sourceRef:'fixture-review',textPreparationReviewed:true}]});assert.match(lexical.spokenText,/nhãn mẫu/);assert.equal(lexical.listeningApproved,false);
});
test('actual local LangChain retrieval cites product facts and abstains on missing price',async()=>{
 const at=new Date(Date.now()-1000).toISOString(),index=buildIndex([{sourceId:'demo:volume',productId:'demo',promotionKey:'evergreen',section:'identity',text:'Dung tích sản phẩm mẫu là500ml.',sourceUri:'fixture:label',sourceHash:'fixture-only',verified:true,verifiedAt:at,validFrom:at,claimFields:['volume']}]);
 const chain=createKnowledgePipeline(index),r=await chain.invoke({query:'Dung tích sản phẩm mẫu?',productId:'demo',promotionKey:'evergreen'});assert.equal(r.status,'retrieved');assert.equal(r.sources[0].id,'demo:volume');assert.equal((await chain.invoke({query:'Giá bao nhiêu?',productId:'demo',promotionKey:'evergreen'})).status,'abstained');
});
