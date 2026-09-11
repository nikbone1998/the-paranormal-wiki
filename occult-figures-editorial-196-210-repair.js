(function(){
const r={
'eleanor-sidgwick':['11 March 1845 — Ripon, England','10 February 1936 — Cambridge, England','Mathematician, educator, and psychical researcher','Eleanor%20Mildred%20Sidgwick.jpg'],
'alice-katherine-buckley':['Late nineteenth-century British medium — exact dates require archival confirmation','Historical record incomplete','Medium and participant in Victorian séance culture','Victorian%20seance.jpg'],
'helene-smith':['9 December 1861 — Martigny, Switzerland','10 June 1929 — Geneva, Switzerland','Medium, automatic writer, and visual artist','Helene%20Smith%20medium.jpg'],
'stefan-ossowiecki':['22 August 1877 — Moscow, Russian Empire','5 August 1944 — Warsaw, Poland','Engineer, clairvoyant, and psychical-research subject','Stefan%20Ossowiecki.jpg'],
'gerard-croiset':['10 March 1909 — Laren, Netherlands','20 July 1980 — Utrecht, Netherlands','Psychic claimant and subject of parapsychological research','Gerard%20Croiset.jpg'],
'marcello-truzzi':['6 September 1935 — Copenhagen, Denmark','2 February 2003 — Ann Arbor, Michigan, United States','Sociologist, writer, and founder of anomalistics','Marcello%20Truzzi.jpg'],
'john-keel':['25 March 1930 — Hornell, New York, United States','3 July 2009 — New York City, United States','Journalist, author, and paranormal investigator','John%20Keel%20writer.jpg'],
'jacques-vallee':['24 September 1939 — Pontoise, France','Living','Astronomer, computer scientist, venture capitalist, and UFO researcher','Jacques%20Vallee.jpg'],
'j-allen-hynek':['1 May 1910 — Chicago, Illinois, United States','27 April 1986 — Scottsdale, Arizona, United States','Astronomer, professor, and UFO investigator','J.%20Allen%20Hynek.jpg'],
'george-p-hansen':['1952 — United States','Living','Researcher and author on anomalistics and the paranormal','George%20P.%20Hansen.jpg'],
'charles-berlitz':['20 November 1914 — New York City, United States','18 December 2003 — Tamarac, Florida, United States','Author, publisher, linguist, and paranormal writer','Charles%20Berlitz.jpg'],
'erich-von-daniken':['14 April 1935 — Zofingen, Switzerland','Living','Author and promoter of ancient-astronaut theories','Erich%20von%20Daniken.jpg'],
'zecharia-sitchin':['11 July 1920 — Baku, Azerbaijan SSR','9 October 2010 — New York City, United States','Author and proponent of ancient-astronaut interpretations','Zecharia%20Sitchin.jpg'],
'maurice-grosse':['6 March 1919 — London, England','14 May 2006 — England','Paranormal investigator and member of the Society for Psychical Research','Maurice%20Grosse.jpg'],
'ed-warren':['7 September 1926 — Bridgeport, Connecticut, United States','23 August 2006 — Monroe, Connecticut, United States','Paranormal investigator, lecturer, and self-described demonologist','Ed%20Warren%20demonologist.jpg']
};
const context={
'eleanor-sidgwick':'Sidgwick’s work emerged from the Society for Psychical Research’s founding ambition to examine extraordinary experiences with the habits of Victorian science: careful reports, committees, correspondence, and a willingness to leave difficult cases unresolved.',
'alice-katherine-buckley':'Buckley is retained because her séance reports belong to the historical network of late Victorian mediumship, but her surviving public biography is thin. This dossier now identifies that archival gap directly rather than inventing a birth date or a fuller life than the evidence supports.',
'helene-smith':'Smith’s séances took place in fin-de-siècle Geneva, where Spiritualism, psychology, Theosophy, art, and experiments in trance could occupy the same salon. Flournoy’s long study made her a key figure in the history of automatic writing and imaginative language.',
'stefan-ossowiecki':'Ossowiecki became a celebrated research subject in interwar Europe, an era when laboratories, salons, newspapers, and psychical societies all sought demonstrations of unusual perception. The war that ended his life also scattered much of the surrounding record.',
'gerard-croiset':'Croiset’s “chair tests” belonged to the postwar Dutch parapsychology scene, where investigators tried to stage public-looking predictions in controlled settings. Each successful-seeming case also invited questions about procedure, reporting, and hindsight.',
'marcello-truzzi':'Truzzi’s anomalistics arose after the cultural battles of the 1970s and 1980s, when paranormal claims, skeptical organizations, and media spectacles were becoming permanent public institutions. He argued that the sociology of a claim mattered as much as the claim itself.',
'john-keel':'Keel wrote in the Cold War UFO era, when contactee stories, newspaper mysteries, intelligence rumors, and old supernatural lore were colliding. The Point Pleasant investigation made him a leading voice for those who saw modern anomalies as continuations of older folklore.',
'jacques-vallee':'Vallée worked across astronomy, computing, and UFO research during the space age, when the extraterrestrial explanation became the default cultural frame. His great contribution was to show that encounter narratives have a much older and stranger comparative history.',
'j-allen-hynek':'Hynek’s shift from Air Force consultant to independent investigator unfolded across Project Blue Book’s years, when official explanation and public fascination continuously fed one another. His classifications gave civilian UFO research a lasting shared vocabulary.',
'george-p-hansen':'Hansen’s work addresses the postwar ecosystem of occult orders, skeptics, parapsychology laboratories, magicians, and conspiracy communities. He examines why exceptional claims so often flourish at the edge of institutional legitimacy.',
'charles-berlitz':'Berlitz wrote for the late twentieth-century mass-market mystery boom, when paperback publishing and television could turn a loose collection of cases into a single global legend. The Bermuda Triangle was one of the most successful examples of that process.',
'erich-von-daniken':'Von Däniken’s first books appeared during the Apollo era, when space travel made ancient skies newly imaginable. His theories gave readers a cosmic explanation for monuments, myths, and unanswered questions about the deep past.',
'zecharia-sitchin':'Sitchin’s books entered a flourishing alternative-history market in the 1970s. His long Nibiru and Anunnaki chronology supplied an unusually complete mythology for readers who wanted ancient texts to conceal a technological history.',
'maurice-grosse':'Grosse’s Enfield work was conducted in a late-1970s Britain where television, tabloids, psychical research, and domestic anxiety could rapidly turn a family crisis into a national haunting. His audio archive remains central to every later retelling.',
'ed-warren':'Warren’s cases took shape in the American postwar culture of Catholic demonology, haunted-house books, lecture circuits, and later horror media. His stories grew more powerful as they migrated from local testimony into bestselling narrative and film.'
};
occultRumorFigures.forEach(function(f){if(!r[f.slug])return;const x=r[f.slug];f.born=x[0];f.died=x[1];f.occupation=x[2];f.image='https://commons.wikimedia.org/wiki/Special:FilePath/'+x[3];f.history=context[f.slug];});
if(typeof route==='function')route();
})();
