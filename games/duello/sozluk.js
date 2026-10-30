// Kelime Düellosu sözlüğü: yaygın, aile dostu 5 harfli Türkçe kelimeler (saf; DOM yok).
// Özel ad, kısaltma, argo yok. Yalnız Türkçe küçük harf (ç ğ ı i ö ş ü dahil), şapkasız yazım.
// Çoğunluk sözlük maddesi; birkaç sık kullanılan çekimli biçim de var (ör. "aşkım", "evler").
// Liste Türk alfabesine göre sıralı. Yeni kelime eklerken tests/duello-sozluk.test.mjs çalıştır.

const HAM = `
  abacı abece abide abiye ablam abone acaba acele acemi acılı acıma açgöz açlık açmak açmaz adale
  adalı adeta adlar adres adsız ağlar ahali ahbap ahenk ahize ahlak ahlat ahşap aidat ajans akıcı
  akide akkor akmak akort akran akrep aksak aksam aksan akşam aktar aktif aktör alaca alaka alarm
  albay albüm alçak alıcı alkış allık almaç almak altın amade ambar amber amcam ameba amele amper
  ampul anane ancak andaç anket anlam anlık anmak annem anons anten antet antik antre aplik araba
  aracı arama arazi ardıç arena argon arıcı arıza arife armut aroma arşın arşiv artık artış asabi
  asılı asker aslan aslen asmak astar astım aşağı aşama aşevi aşırı aşina aşkım aşkın aşmak aşure
  atama atlar atlas atlet atmak avans avare avize avlak avunç avurt aydın aygır aygıt aylak aylar
  aylık aynen ayraç ayran ayrık ayrım azami azlık babam babet bacak badem bagaj baget bağcı bağış
  bağıt bağlı bahar bahçe bahis bakan bakım bakır bakış bakla balad balcı balık balım ballı balon
  balta balya bambu bamya bando banjo banka banyo baraj barem baret barış bariz barok basık basın
  basit baskı basma başak başka batak batık batış bavul bayan bayat bayır bazen bebek bedel beden
  beher bekar bekçi belde belge belki belli bemol bence benek benim beniz benli besin beste beşer
  beşik beşiz beşli betik beton beyan beyaz beyin beyit beyti bezek bezir bıçak bıçkı bıyık biber
  biblo biçim biçki bidon bilek bilet bilge bilgi bilim bilye binek biner biraz birer birey birim
  bitek bitiş bitki bizim bizon bobin bodur boğaz boğuk boğum bohça bolca bordo borsa boylu boyun
  boyut bozuk böcek bölen bölge bölme bölük bölüm börek böyle branş bravo bronz bucak buçuk budak
  bugün buhar buket bukle bulgu buluş bulut burgu burma buruk burun butik buzlu buzul bünye bütan
  bütçe bütün büyük cacık cadde cahil camcı camia camlı canım canlı casus cazip cebir ceket cemre
  cenup cephe cepli cesur cevap ceviz cezir cezve cicim ciddi ciğer cihaz cilve cimri cirit cisim
  civar conta coşku cumba cümle cüret çabuk çadır çağla çağrı çakal çakıl çakır çalgı çalım çamlı
  çamur çanak çanta çaput çarık çarpı çarşı çatal çatık çavuş çaycı çayır çehre çekiç çekim çekiş
  çelik çello çeper çerez çeşit çeşme çeşni çetin çevik çevre çeyiz çığır çıkar çıkış çıktı çınar
  çırak çıtır çiçek çifte çilek çilli çimen çinko çivit çizge çizgi çizik çizim çizme çoban çocuk
  çoğul çokça çoklu çomak çorak çorap çorba çöğür çöküş çöpçü çörek çözüm çubuk çukur çupra çuval
  çünkü çürük dağcı dağlı dahil daima daimi daire dakik dalak dalga dalış dallı dalya damak damar
  damat damga damla davet davul dayım dedem defne değer değil değin dekan dekar dekor delik delil
  delta demek demet demin demir denek deney denge denim deniz derbi dergi derin derya desen deste
  detay devam devir devre deyim deyiş dibek diğer diken dikey dikiş dikme dilek dilim dilli direk
  dişçi dişli divan diyar diyet diyez dizel dizgi dizin doğaç doğal doğan doğru doğum doğuş dokuz
  dolap dolar dolgu dolma dolum donuk dorse doruk dosya doyum dökme döküm dönem döner döngü dönük
  dönüm dönüş döşek döven döviz dövme drama dudak duman durak durum duruş duvak duvar duygu dübel
  düdük düğme düğüm düğün dümen dünür dünya dürtü dürüm düşük düşüş düzen düzey efekt egzoz eğmek
  ejder ekici eklem ekmek ekose ekran eksen eksik elbet eleme elips eller elmas elyaf emlak emsal
  emtia emzik endam ender enfes engel engin enkaz enlem enzim erbap erdem ergen ergin erinç erkek
  erken erkin ermek erzak esans eskiz esmer esnaf esnek espri eşarp eşler eşlik eşsiz etçil etken
  etkin etler etmek etnik etraf evcil evlat evler evrak evren evrim evsiz evvel eylem eylül eyvah
  ezber ezici ezmek fagot fahri fakat fakir falan falcı falez falso fanus faraş fasıl fayda fazla
  felek fener ferah ferdi fevri feyiz fıkra fırça fırın fiber fidan figür fiili fikir fikri filiz
  final firma fiske fitil fiyat fizik flört folyo fonem forma forum fosil foton fresk fuaye fular
  fulya funda fuşya galip galon galoş gamlı gamze garaj garip gayet gazel gazoz geçen geçim geçiş
  geçit gedik gelin gelir geliş genel geniş geniz gerçi gereç gerek geyik gıpta gider gidiş gidon
  girdi giriş gitar giyim giysi gizem gizli golcü gonca goril gotik göbek göçer göğüs gölet gölge
  gömme gönül gönye görev görgü görüş gövde gözcü gözde gözlü gözüm guguk gurup gurur gübre güçlü
  güdüm güğüm güleç güllü gülüm gülüş gümüş günah günce güneş güney güreş güveç güven güzel güzün
  haber hacim hafif hafta hakem hakim haklı halam halat halay halef halen halis halka hamak hamal
  hamam hamle hamsi hamur hancı hangi hanım harap hariç hasar hasat hasır hasta haşin hatır hatip
  hatmi hatta havan havlu havuç havuz havza hayal hayat haydi hayır hayli hazan hazım hazır hazin
  hazne hedef hekim helva hemen henüz hepsi hesap heves heybe heyet hırka hızar hızla hızlı hiciv
  hilal hindi hisar hisse hitap hokey hokka horon horoz hoşaf hoşça hudut hukuk humus hurda hurma
  husus huylu huzme huzur hücre hüküm hülya hüner hüzün ılgın ılıca ırmak ıslah ıslak ıslık ısrar
  ıssız ışıma ibare ibrik içeri içmek içsel içten içyüz idare iddia ideal idman idrak ifade iflas
  ihale ihlal ihmal ihraç ikbal ikili iklim ikmal ikram iksir ilave ileri ilham ilkel ilkin ilmek
  ilmik imbat imbik imdat imece imkan imleç inanç incir indis inmek insaf insan ipler iplik iptal
  ipucu irade irfan irmik iskan ispat israf istek istem istif işlem işler işlev işsiz iştah itaat
  ithaf ithal itici itina itmek ivedi iyice izafi izlek izler jeton jilet joker jokey kabak kaban
  kabin kablo kabuk kabul kabus kabza kaçak kaçış kadar kader kadın kadim kadir kadro kafes kağıt
  kağnı kahır kahve kaide kakao kakma kakül kalas kalay kalem kalfa kalın kalıp kalış kalıt kamçı
  kamış kamil kanal kanat kanca kanıt kanun kapak kapan kaput karar karga kargo karım karın karış
  karlı karma karne karşı kasap kaset kasım kasıt kaşar kaşık kaşif katık katır katip katkı katlı
  kavak kaval kavga kavis kavun kayaç kayak kaygı kayık kayın kayıp kayış kayıt kayma kayra kazak
  kazan kazık kazma kebap keder kedim kefal kefil kefir kekik kelam keman kemer kemik kenar kendi
  kenet kepçe kepek kesek keser kesik kesim kesin kesir kesit keski kesme keşif keşke keten keyfi
  keyif kıdem kılıç kılıf kılık kıraç kırat kırık kısık kısım kısır kısmi kıssa kışın kıvam kıyas
  kıyma kızak kızıl kızım kibar kibir kiler kilim kilit kimse kimya kiraz kireç kiriş kirli kirpi
  kitap kitle klima klips koala kobay kobra kocam kolaj kolay kolej kollu kolon kolye kolza kombi
  komik komşu komut konak konuk konum konut kopça kopuk kopuş kopya korku korna korno koruk koşma
  koşul kovan kovuk koyun köfte köken köklü kömür köpek köprü köpük körpe körük köylü kramp krank
  kredi krema kriko kroki kubbe kucak kukla kulaç kulak kulis kulüp kumaş kumlu kumru kumul kupon
  kurak kural kuram kurgu kurul kurum kuruş kurye kusur kuşak kuşçu kuşet kuşku kutlu kutup kuzen
  kuzey kuzum küçük küflü külah külçe kümes künye kürek kürsü kütle kütük küvet lades ladin lagün
  lahza lakap lakin lamba larva latif latte lavaş lavta layık lazer lazım leğen lehçe lehim levha
  levye leziz lider likit liman limit limon lirik lisan liste litre lodos lokal lokma lokum lonca
  lotus lüfer lügat lütuf lüzum macun madde madem maden magma mahal mahir makam makas maket makul
  malum mamut manav manda mango mantı manto marka martı marul masaj masal masat maske masum mayıs
  mazot mazur mecal mecaz mecra medet medya meğer mekan mekik melek melez memur menfi merak meram
  merci mesai mesaj mesel meşin metal metan metin metot metre metro mevki mevzu meyan meyil meyve
  mezat mezra mezun mısır mısra midye milat mimar mimik minik miras misal miyop mizaç mizah mobil
  model modem modül moloz moral motel motif motor motto mucit mutlu muzip müdür mühim mühür müjde
  müzik nabız nadas nadir nağme nakış nakil nakit nalcı nalın narin nasıl nasır nasip nazar nazım
  nazik nazlı nebat nebze neden nefes nefis nehir nemli nesil nesir nesne neyse nezih nezle niçin
  nikah nikel nimet ninem ninni nisan nişan nitel niyet nizam nohut nokta noter nöbet nurlu nüans
  nüfus nükte nüsha obruk oğlak oğlan oğlum oklar oksit oktav okuma olası olgun olmak omlet onlar
  onluk opera optik orada organ orman ortak ortam otçul otlak otlar ovmak oymak oynak ödeme ödünç
  öğlen öksüz ölçek ölçüm ölçüt ölgün öncel öncül önder öneri önlem önlük önsel önsöz öpmek ördek
  örgüt örmek örnek örtük öteki ötmek ötücü ötürü övmek övünç özdeş özerk özgün özgür özlem öznel
  pabuç pafta paket palet palto pamuk panda panel panik papuç parça parka parke parti pasaj pasif
  pasta paten patik payda pazar pazen pedal pelin pelte pembe pençe pense penye perde peron peruk
  peşin petek pınar pikap pilav piliç pilot pipet piton piyaz piyon pizza plaka plato plaza plise
  polar polen polis polka pompa porte posta poşet potin prens proje prova pruva pudra pullu punto
  puset puslu pürüz radar radyo ragbi rahat rakam raket rakip rakun ralli rampa ranza rapor rasat
  rayiç reçel refah rejim rekor rende resif resim resmi reşit retro reyon rimel ritim robot roket
  roman rosto rozet röfle rötar rötuş rubai ruhum rumba rumuz rutin rütbe rüyam sabah saban sabır
  sabit sabun saçak sadık safha safir sağır sahan sahil sahip sahne sahte sakal sakar sakız sakin
  saklı saksı salam salça salep salık salım salim salon salsa saman samba samur sanal sanat sancı
  sanki sanrı sapan saplı sapma saraç saray sargı sarma saten satıh satır satış sauna savan savaş
  savcı sayaç sayfa saygı sayım sayın sazan seans sebat sebep sebze seçim seçki seçme sedef sedir
  sedye sefer seher sehpa sekiz sekte selam selef selvi semer sence senet senin sepet serap serçe
  sergi serin serum servi sesli sevda sevgi seyir sezgi sezon sıcak sıfat sıfır sığır sıkça sıkma
  sınav sınıf sınır sırça sırık sırlı sırma sicil sicim sifon sihir silgi silik simge simit simli
  simya sinek sinir siren sirke sisli sitem sivil sivri siyah sizce sizin slayt sofra soğan soğuk
  sokak soket solak soluk somon somun somut sonar sonat sonlu sonra sonuç sorgu sorun sosis soslu
  soylu soyut söğüt sönük sözcü sözde sözel sözlü stant statü stres subay sucuk suçlu sufle sulak
  sular sumak sunta sunum supap surat suret susam susuz sükun sükut sülük sülün süper sürat süreç
  sürek sürgü sürme sürüm sürüş süsen süslü sütçü sütlü sütun süzme şafak şahıs şahin şahit şahsi
  şakak şanlı şapka şarkı şayet şehir şeker şekil şeref şerit şifon şifre şilte şimal şimdi şirin
  şoför şölen şöyle şubat şurup şükür şüphe tabak taban tabii tabir tabla tablo tacir taçlı tafta
  tahıl tahin tahta takas takat takım takip takla takma takoz taksi talaş talep talih talim tamah
  tamam tamir tango tanık tanım taraf tarak tarım tarif tarih tarla tartı tasma taşçı taşıt taşlı
  taşra tatil tatlı tavan tavır taviz tavla tavuk tavus tayga tayin teğet tehir tekel teker tekil
  tekir tekli tekne telaş telli telve temas temel temiz tempo tenha tenis tenor tente teori tepki
  tepsi teras terim terzi tesir tesis testi teyel teyit teyze tezat tıkaç tımar tıraş tilki tipik
  tiraj titan titiz tohum tomar tonaj tonik topaç topak toplu topuk topuz torba tortu torun tozlu
  tören törpü trafo trend triko tufan tuğla tuğra tuhaf tulum tunik turbo turna turne turşu turta
  tutaç tutam tutar tutku tutum tuval tuzak tuzlu tümce tünel türev türkü türlü tütsü tüylü tüzük
  uçlar uçmak uçsuz uçucu uğrak uğraş ummak unlar unsur unvan urgan usanç uskur ussal utanç uyarı
  uygar uygun uyluk uymak uyruk uysal uzman ücret üçgen ünite ünlem ünsüz ürkek üslup üstat üstel
  üstün üzere üzgün üzmek vagon vahim vahşi vakar vakıa vakıf vakit vakum valiz vapur varış varil
  vasat vasıf vaşak vatan vatka vatoz vekil verev vergi verim veriş vezir vezne video villa vinil
  viraj virüs vişne vites vokal volan vurgu vuruş vücut yaban yağış yağız yağlı yahut yakın yakıt
  yakut yalan yamaç yamak yamuk yanak yanal yanık yanıt yankı yansı yapay yapım yapıt yapma yarar
  yargı yarık yarım yarın yarış yarim yarma yasak yasal yaşam yaşıt yaşlı yatak yatay yatış yavan
  yavaş yavru yavuz yayan yaygı yayık yayım yayın yayla yazar yazgı yazık yazım yazın yazıt yazma
  yedek yeğen yelek yemek yemin yemiş yenge yenik yerel yerli yeşil yeşim yeter yetim yetki yığın
  yıkım yılan yiğit yirmi yoğun yoksa yokuş yolcu yonca yonga yorum yosun yudum yufka yulaf yumak
  yumru yunus yuvam yüklü yünlü yürek yüzde yüzer yüzey yüzme yüzük zafer zahir zaman zamir zarar
  zarif zaten zayıf zebra zemin zerde zerre zıbın zımba zigon zihin zinde zirve ziyan zorla zorlu
  zurna zümre
`;

export const KELIMELER = Object.freeze(HAM.trim().split(/\s+/));

const KUME = new Set(KELIMELER);

/** Kelime sözlükte mi? Girdi tr küçük harf, boşluksuz olmalı (normalize etmek çağırana düşer). */
export function kelimeVar(k) {
  return typeof k === 'string' && KUME.has(k);
}

/** Sözlükten rastgele kelime. rnd: () => [0,1) */
export function rastgeleKelime(rnd = Math.random) {
  const i = Math.min(KELIMELER.length - 1, Math.floor(rnd() * KELIMELER.length));
  return KELIMELER[i];
}
