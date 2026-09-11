(function(){
const r={
'jose-silva':['11 August 1914 — Laredo, Texas, United States','7 February 1999 — Laredo, Texas, United States','Self-help teacher and founder of the Silva Method','Jose%20Silva%20Silva%20Method.jpg'],
'paramahansa-yogananda':['5 January 1893 — Gorakhpur, India','7 March 1952 — Los Angeles, California, United States','Yogi, guru, author, and founder of Self-Realization Fellowship','Paramahansa%20Yogananda.jpg'],
'swami-vivekananda':['12 January 1863 — Kolkata, India','4 July 1902 — Belur Math, India','Hindu monk, philosopher, author, and founder of the Ramakrishna Mission','Swami%20Vivekananda.jpg'],
'sri-aurobindo':['15 August 1872 — Calcutta, India','5 December 1950 — Pondicherry, India','Philosopher, poet, nationalist, yogi, and spiritual teacher','Sri%20Aurobindo.jpg'],
'ramana-maharshi':['30 December 1879 — Tiruchuzhi, India','14 April 1950 — Tiruvannamalai, India','Advaita teacher and Hindu sage','Ramana%20Maharshi.jpg'],
'meher-baba':['25 February 1894 — Pune, India','31 January 1969 — Meherabad, India','Spiritual teacher, author, and founder of the Meher Baba movement','Meher%20Baba.jpg'],
'osho':['11 December 1931 — Kuchwada, India','19 January 1990 — Pune, India','Spiritual teacher, lecturer, and author','Osho.jpg'],
'sathya-sai-baba':['23 November 1926 — Puttaparthi, India','24 April 2011 — Puttaparthi, India','Spiritual teacher and founder of the Sathya Sai Organization','Sathya%20Sai%20Baba.jpg'],
'maharishi-mahesh-yogi':['12 January 1918 — Jabalpur, India','5 February 2008 — Vlodrop, Netherlands','Meditation teacher and founder of Transcendental Meditation','Maharishi%20Mahesh%20Yogi.jpg'],
'alan-watts':['6 January 1915 — Chislehurst, England','16 November 1973 — Druid Heights, California, United States','Writer, lecturer, philosopher, and comparative religion scholar','Alan%20Watts.jpg'],
'ram-dass':['6 April 1931 — Newton, Massachusetts, United States','22 December 2019 — Maui, Hawaii, United States','Psychologist, spiritual teacher, author, and humanitarian','Ram%20Dass.jpg'],
'charles-fort':['6 August 1874 — Albany, New York, United States','3 May 1932 — The Bronx, New York, United States','Writer, researcher, and collector of anomalous reports','Charles%20Fort.jpg'],
'william-hope':['15 March 1863 — Crewe, England','8 March 1933 — Crewe, England','Spirit photographer and spiritualist medium','William%20Hope%20spirit%20photographer.jpg'],
'ada-goodrich-freer':['1848 — Uppingham, England','1931 — United Kingdom','Psychical researcher, writer, and investigator of hauntings','Ada%20Goodrich%20Freer.jpg']
};
const context={
'jose-silva':'Silva’s courses were born in the postwar American self-improvement market, where hypnosis, relaxation, parapsychology, and positive thinking often shared the same hotel ballroom and mail-order advertisement. The method’s use of “alpha” vocabulary gave students a modern-sounding frame for imaginative exercises.',
'paramahansa-yogananda':'Yogananda’s 1920 arrival at the International Congress of Religious Liberals in Boston opened a long American career. His lecture tours, lessons, and Los Angeles headquarters gave Kriya Yoga a stable institutional home outside India.',
'swami-vivekananda':'Vivekananda spoke at Chicago’s 1893 Parliament of Religions during a period of colonial rule and intense debate over how Indian traditions should meet the modern world. His English-language lectures were part spiritual teaching, part argument for India’s philosophical dignity.',
'sri-aurobindo':'Aurobindo’s movement from revolutionary politics to Pondicherry did not erase his political world; it enlarged his sense that collective life and consciousness were unfinished. His collaboration with Mirra Alfassa made the ashram a laboratory for that broad vision.',
'ramana-maharshi':'The growth of Ramanasramam at Arunachala showed how a teacher who offered few formal doctrines could still generate a substantial community of translators, devotees, and visitors. His Indian setting became a destination for a global nondual audience.',
'meher-baba':'Meher Baba’s silence, maintained from 1925 until his death, made gesture, alphabet-board communication, and devoted interpretation central to his movement. His Indian centers and overseas journeys linked devotional Hindu forms to an international following.',
'osho':'Rajneeshpuram in Oregon made Osho’s movement a public test case for intentional community, charismatic authority, local politics, and vast organizational ambition. Its dramatic collapse remains as important to the story as the meditation methods.',
'sathya-sai-baba':'Puttaparthi became a global pilgrimage center through a network of schools, hospitals, volunteer service, and devotion. The movement’s public service institutions and miraculous narratives grew together rather than as separate parts of its identity.',
'maharishi-mahesh-yogi':'The Maharishi built a standardized global organization at the moment television, celebrity culture, university research, and the counterculture were giving Indian meditation an enormous new audience. The Beatles’ Rishikesh visit made that transformation visible worldwide.',
'alan-watts':'Watts was shaped by California’s postwar meeting of Zen, radio, jazz, psychotherapy, and counterculture. His live talks were as important as his books: he made comparative religion sound conversational, playful, and immediately personal.',
'ram-dass':'Ram Dass returned from India just as the American counterculture was looking for forms of discipline that could survive the psychedelic moment. Be Here Now became a handmade-looking bridge between Hindu devotion, meditation practice, and a new American spiritual language.',
'charles-fort':'Fort’s life work depended on the expanding nineteenth- and early-twentieth-century archive of scientific journals, newspapers, and library catalogues. He turned that sea of stray reports into a literary challenge to the boundaries of respectable knowledge.',
'william-hope':'Hope worked during the age when photography carried unusual authority as testimony. Spirit photographs were therefore never merely pictures: they were invitations to argue over chemicals, plates, darkrooms, witnesses, grief, and the possibility of survival after death.',
'ada-goodrich-freer':'Freer’s investigations belong to the late Victorian and Edwardian world of psychical research, private correspondence, and the haunted-country-house narrative. Her work took domestic testimony seriously as a record of place, memory, and unusual experience.'
};
occultRumorFigures.forEach(function(f){if(!r[f.slug])return;const x=r[f.slug];f.born=x[0];f.died=x[1];f.occupation=x[2];f.image='https://commons.wikimedia.org/wiki/Special:FilePath/'+x[3];f.history=context[f.slug];});
if(typeof route==='function')route();
})();
