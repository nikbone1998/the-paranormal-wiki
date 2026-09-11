(function(){
const focus={
'manly-p-hall':'the Philosophical Research Society, comparative symbolism, and the public lecture tradition',
'charles-stansfeld-jones':'gematria, Thelema, and the problem of succession after Crowley',
'wilfred-talbot-smith':'Agape Lodge, Pasadena ritual life, and the practical work of a local OTO body',
'victor-neuburg':'poetry, Pan, desert travel, and recovery from a dominating magical partnership',
'leah-hirsig':'the Abbey of Thelema, women’s authority, and the labor hidden behind the Scarlet Woman myth',
'jane-wolfe':'Cefalù diaries, disciplined concentration, and the quiet reality of A∴A∴ training',
'hymenaeus-beta':'the late twentieth-century OTO revival, publishing, and documentary succession',
'william-breeze':'archives, charters, copyright, and the administration of a modern initiatory order',
'michael-staley':'Starfire, Typhonian publishing, and the recovery of difficult occult texts',
'marcelo-ramos-motta':'Brazilian Thelema, strict study, and rival claims to Crowleyan authority',
'robert-ambelain':'French Martinism, practical ritual, and postwar reconstruction of older magic',
'serge-hutin':'paperback occult culture, secret-society surveys, and the movement of legend into print',
'andre-nataf':'reference books, cross-references, and the cultural mapping of Western esotericism',
'pierre-plantard':'forged archives, sacred geography, and the modern conspiracy as historical theater',
'boris-mouravieff':'Geneva groups, Christian esotericism, and disciplined inner observation'
};
Object.keys(focus).forEach(function(slug){var f=occultRumorFigures.find(function(x){return x.slug===slug;});if(!f)return;var z=focus[slug];
f.biography+='<br><br>'+f.name+' is best understood through '+z+'. The public legend is vivid, but the working history is made from meetings, correspondence, books, students, and the material conditions that allowed a small teaching to survive. Following those links shows where the figure’s authority came from and how later admirers selected the episodes that now seem inevitable.';
f.works+='<br><br>The works belong to a particular circulation history. They were read in lodges, private rooms, specialist bookstores, lecture halls, and later online communities. Their importance lies not only in what they claim, but in the habits they create: how a reader studies a symbol, repeats an exercise, joins a group, or turns a disputed story into a usable tradition.';
f.ideas+='<br><br>These ideas operate simultaneously as belief, symbol, and practice. A planetary image can organize ritual; a conspiracy can explain institutional distrust; a visionary story can give personal change a dramatic vocabulary. The meaning shifts with the community using it, which is why the same material can appear devotional to one reader and psychological or artistic to another.';
f.influence+='<br><br>The influence is visible in identifiable pathways rather than vague resemblance. Later practitioners quoted the books, copied the rituals, adopted the symbols, or built organizations in response to them. Artists and writers also detached individual images from their original setting. Those borrowings created new traditions while preserving traces of the older one.';
f.controversies+='<br><br>Controversy surrounds both evidence and power. Some disputes concern dates, documents, or claims of lineage; others concern charisma, exclusion, money, sexuality, or the right to speak for a tradition. The competing accounts remain part of the dossier because they show how reputations are defended, attacked, and remodeled over time.';
f.sources+='<br><br>Further reading should be compared rather than treated as a single verdict. Primary texts reveal how the figure presented the work; biographies reconstruct the surrounding life; institutional records show reception; and later scholarship tests the inherited story. Reading those layers together keeps the mystery intact without confusing repetition with independent confirmation.';
});
if(typeof route==='function')route();
})();
