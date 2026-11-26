/**
 * Seed definitions for the Pan-Himalayan regions and craft hubs.
 * These are additive defaults loaded once per slug on DB initialisation;
 * administrators can edit any region/craft or add new ones at runtime.
 */

export interface SeedRegionDef {
  id: string;
  name: string;
  slug: string;
  shortName: string;
  introText: string;
  heroImage: string;
  famousCrafts: string[];
  famousFoods: string[];
  faqs: Array<{ question: string; answer: string }>;
  sortOrder: number;
}

export interface SeedCraftDef {
  id: string;
  name: string;
  slug: string;
  introText: string;
  history: string;
  howToIdentify: string;
  heroImage: string;
  faqs: Array<{ question: string; answer: string }>;
  sortOrder: number;
}

export const DEFAULT_HIMALAYAN_REGIONS: SeedRegionDef[] = [
  {
    id: 'reg_himachal',
    name: 'Himachal Pradesh',
    slug: 'himachal-pradesh',
    shortName: 'Himachal',
    heroImage: '/images/home/kalpa-dawn-1100.jpg',
    sortOrder: 10,
    famousCrafts: ['Kullu Shawls', 'Kinnauri Shawls', 'Chamba Rumal', 'Kullu Topi', 'Deodar Woodcraft'],
    famousFoods: ['Kangra Orthodox Tea', 'Lahaul Wild Honey', 'Chamba Rajma', 'Kinnauri Apples', 'Chuli Apricot Oil'],
    introText:
      'Spanning Dhauladhar tea gardens, Kullu handloom valleys, Kinnaur orchards, and Chamba embroidery workshops, Himachal Pradesh preserves mountain livelihoods practiced between 3,000 and 12,000 feet. Local weaving cooperatives spin indigenous sheep wool and fine Merino yarn on wooden pit looms to create geometric Kullu borders and sacred Kinnauri motifs that can take months to finish. In the lower Kangra basin, family gardens pluck first-flush orthodox green and black leaves nourished by glacial streams and monsoon mist. High-altitude beekeepers harvest raw unheated polyfloral honey across wild thyme and rhododendron slopes, while Kinnaur and Shimla growers pack crisp heritage apples and cold-press wild apricot kernels into nutrient-rich oil. Every regional listing here connects buyers directly with reviewed hill workshops, farmer collectives, and documented district origins.',
    faqs: [
      {
        question: 'Which products from Himachal Pradesh carry GI recognition?',
        answer:
          'Recognised regional Geographical Indications include Kullu Shawl, Kinnauri Shawl, Kangra Tea, Chamba Rumal, and Himachali Kala Zeera. On our marketplace, a GI badge appears only after an administrator reviews the seller documentation.',
      },
      {
        question: 'How are Himachal woollen shawls distinguished from factory blends?',
        answer:
          'Handloom Kullu and Kinnauri shawls show crisp interlocks on the reverse border with subtle weave irregularities, while acrylic imitations rely on printed or glued backing.',
      },
    ],
  },
  {
    id: 'reg_uttarakhand',
    name: 'Uttarakhand',
    slug: 'uttarakhand',
    shortName: 'Uttarakhand',
    heroImage: '/images/home/himalayan-ridges-morning.jpg',
    sortOrder: 20,
    famousCrafts: ['Aipan Ritual Art', 'Bhotiya Handloom', 'Ringaal Bamboo Basketry', 'Tamta Copperware'],
    famousFoods: ['Bhatt & Gahat Pulses', 'Buransh Squash', 'Pahadi Wild Honey', 'Munsiyari Rajma', 'Bhangjeera'],
    introText:
      'Across the Garhwal and Kumaon divisions of Uttarakhand, village women, high-valley pastoralists, and metal artisans maintain distinct mountain traditions. In Kumaon towns such as Almora and Nainital, households paint geometric Aipan motifs using white rice paste over ochre terracotta plaster, now thoughtfully adapted onto cotton runners, wall panels, and wooden keepsakes. Along the high Johar and Niti passes, Bhotiya weavers craft dense warm woollen thulmas, gudmas, and shawls built for freezing alpine winters. Copper smiths in Almora shape heavy hand-hammered Tamta vessels valued for traditional cooking and water storage, while hill farms cultivate protein-rich Munsiyari rajma, bhatt soybeans, jakhiya wild mustard, and raw blossom honey. Every workshop profile states exact village or district provenance before publication.',
    faqs: [
      {
        question: 'What is unique about handicrafts from Garhwal and Kumaon in Uttarakhand?',
        answer:
          'Uttarakhand crafts blend high-altitude Bhotiya wool weaving and Ringaal dwarf-bamboo basketry with Kumaoni Aipan geometric painting and hand-beaten Almora copperwork.',
      },
      {
        question: 'Are Uttarakhand foods like Munsiyari rajma and wild honey packed by local collectives?',
        answer:
          'Yes. Producers and mountain self-help groups pack small-batch harvests directly in Kumaon and Garhwal with FSSAI registration where packaged food rules apply.',
      },
    ],
  },
  {
    id: 'reg_kashmir',
    name: 'Jammu & Kashmir',
    slug: 'jammu-and-kashmir',
    shortName: 'Jammu & Kashmir',
    heroImage: '/images/home/snow-peaks-1100.jpg',
    sortOrder: 30,
    famousCrafts: ['Kashmir Pashmina', 'Sozni Embroidery', 'Kani Woven Shawls', 'Walnut Wood Carving', 'Papier-Mache'],
    famousFoods: ['Pampore Kesar Saffron', 'Kashmiri Kahwa', 'Acacia Honey', 'Mamra Almonds', 'Gucchi Morels'],
    introText:
      'For centuries, artisan karkhanas in Srinagar, Budgam, Pampore, and Anantnag have refined fine handloom textiles, intricate needlework, and heirloom woodcraft. True Kashmir Pashmina begins with Changthangi underfleece hand-spun on wooden yinder wheels and woven on traditional handlooms, then finished by master Sozni, Aari, or Kani weavers whose patterns can require six months to two years per stole. Outside textiles, master carvers work seasoned local walnut wood into jaali latticework screens and boxes, while Pampore growers carefully harvest crimson Crocus sativus saffron threads every autumn alongside fragrant Kahwa spice blends and light Kashmiri acacia honey. On this platform, claims of pure Pashmina or GI-certified origin remain blocked until supporting craft marks or laboratory certificates pass administrative review.',
    faqs: [
      {
        question: 'How do you prevent fake machine-spun viscose from being listed as Kashmir Pashmina?',
        answer:
          'Sellers cannot use the protected "pure pashmina" or "GI certified" labels until administrators review supporting yarn origin or Craft Development Institute / Pashmina testing records.',
      },
      {
        question: 'Which foods from Jammu & Kashmir have strong seasonal demand?',
        answer:
          'Pampore saffron, Kahwa green tea blends, Mamra almonds, paper-shelled walnuts, and single-origin Kashmiri acacia honey are among the most sought-after regional harvests.',
      },
    ],
  },
  {
    id: 'reg_ladakh',
    name: 'Ladakh',
    slug: 'ladakh',
    shortName: 'Ladakh',
    heroImage: '/images/home/kalpa-dawn-1800.jpg',
    sortOrder: 40,
    famousCrafts: ['Changthangi Raw Pashmina', 'Ladakhi Woolen Nambu', 'Thangka Scroll Art', 'Apricot Woodcraft'],
    famousFoods: ['Seabuckthorn Juice & Pulp', 'Ladakhi Dried Apricots', 'Barley Sattu (Ngamphey)', 'Wild Mountain Honey'],
    introText:
      'At elevations above 10,000 feet across Leh, Kargil, Nubra, and the Changthang plateau, Ladakh produces resilient alpine fibres and sun-concentrated superfruits. Semi-nomadic Changpa herders comb ultra-fine winter undercoat from Changthangi goats, forming the raw source behind India’s finest hand-spun Pashmina alongside thick woven Nambu wool blankets suited for sub-zero nights. Monastic and village painters preserve classical mineral-pigment Thangka scrolls and carved wooden Choktse tables. Meanwhile, fertile river oases in Sham, Nubra, and Kargil harvest honey-sweet Halman and Raktsey Karpo apricots dried naturally in crisp mountain sunlight, plus tangy antioxidant-rich wild seabuckthorn berries. Each Ladakh listing highlights the valley, herder cooperative, or women’s self-help collective responsible for processing and dispatch.',
    faqs: [
      {
        question: 'What is the connection between Ladakh and Kashmiri Pashmina?',
        answer:
          'The ultra-fine Changthangi goat fleece (typically 12 to 15 microns) comes from Ladakh’s Changthang plateau, where winter temperatures drop below -30°C.',
      },
      {
        question: 'Why are Ladakhi apricots and seabuckthorn prized?',
        answer:
          'Intense high-altitude UV sunlight and cold nights concentrate natural sugars and vitamin C in Ladakhi apricots and wild seabuckthorn berries without synthetic preservatives.',
      },
    ],
  },
  {
    id: 'reg_sikkim',
    name: 'Sikkim',
    slug: 'sikkim',
    shortName: 'Sikkim',
    heroImage: '/images/hero-village.jpg',
    sortOrder: 50,
    famousCrafts: ['Lepcha Backstrap Weaving', 'Bhutia Carpet Craft', 'Choktse Wooden Tables', 'Handmade Lokta Paper'],
    famousFoods: ['Temi Organic Tea', 'Dalle Khursani Chilli', 'Large Cardamom (Badi Elaichi)', 'Sikkim Orthodox Honey'],
    introText:
      'Framed beneath Kangchenjunga, Sikkim blends organic mountain agriculture with indigenous Lepcha, Bhutia, and Nepali craft traditions. Lepcha weavers create vivid striped cotton-and-silk textiles on portable bamboo backstrap looms, turning durable handwoven cloth into traditional bags, table runners, and wraps. Carvers fashion collapsible Choktse tables painted with auspicious Himalayan motifs, while paper-makers beat wild Daphne bark into textured Lokta stationery. Across terraced hillsides in South Sikkim, Temi Tea Garden and small organic estates produce delicate floral teas alongside fiery fermented Dalle Khursani chillies, smoky large cardamom pods cured over low wood fires, and ginger-turmeric spices grown without synthetic farm inputs. Every Sikkim seller discloses village block origin and food safety credentials where applicable.',
    faqs: [
      {
        question: 'Are Sikkim food listings certified organic by default?',
        answer:
          'No. Although Sikkim transitioned state agriculture toward organic farming, listings cannot use the phrase "organic certified" unless the seller provides a valid certificate verified by an administrator.',
      },
      {
        question: 'What is Lepcha weaving known for?',
        answer:
          'Lepcha weaving uses narrow bamboo-and-wood backstrap looms to craft tightly ribbed striped fabrics originally made from wild nettle and cotton yarns.',
      },
    ],
  },
  {
    id: 'reg_arunachal',
    name: 'Arunachal Pradesh',
    slug: 'arunachal-pradesh',
    shortName: 'Arunachal Pradesh',
    heroImage: '/images/home/himalayan-cottage-sunrise-closing-1024.webp',
    sortOrder: 60,
    famousCrafts: ['Apatani & Adi Backstrap Weaves', 'Monpa Handmade Paper', 'Cane & Bamboo Craft', 'Monpa Mask Carving'],
    famousFoods: ['Arunachal Mandarin & Kiwi Wine/Preserves', 'Wild Forest Honey', 'Organic Ginger', 'Tawang Yak Cheese'],
    introText:
      'Home to twenty-six major indigenous communities across Eastern Himalayan valleys from Tawang and Ziro to Pasighat, Arunachal Pradesh boasts extraordinary textile, bamboo, and paper heritage. Women weavers in Ziro, Siang, and Bomdila work loin looms to compose bold diamond, triangle, and anthropomorphic motifs passed orally from mother to daughter. In Tawang and West Kameng, Monpa artisans produce traditional Shugu Sheng handmade paper from Daphne bark alongside carved wooden bowls, ceremonial masks, and natural-dyed wool carpets. Beyond textiles, forested valleys yield pungent organic ginger, wild cliff-and-forest honey, citrus preserves, and bamboo shoots prepared by village women groups. Every product specifies community craft heritage, region, and artisan workshop transparency.',
    faqs: [
      {
        question: 'How are Arunachal Pradesh backstrap loom textiles made?',
        answer:
          'Backstrap (loin-loom) weaving anchors one end of the warp to a stationary beam and the other around the weaver’s waist, producing strong ribbed cloth in relatively narrow panels.',
      },
      {
        question: 'Can handmade paper and bamboo crafts from Arunachal ship safely across India?',
        answer:
          'Yes. Makers pack dried bamboo baskets, woven runners, and Monpa bark paper in rigid moisture-protected cartons for nationwide courier delivery.',
      },
    ],
  },
  {
    id: 'reg_darjeeling_kalimpong',
    name: 'Darjeeling & Kalimpong',
    slug: 'darjeeling-kalimpong',
    shortName: 'Darjeeling & Kalimpong',
    heroImage: '/images/home/kinnaur-ridge-1100.jpg',
    sortOrder: 70,
    famousCrafts: ['Kalimpong Handloom & Felt', 'Tibetan Carpets', 'Lokta Paper Notebooks', 'Bamboo & Copper Craft'],
    famousFoods: ['Darjeeling First & Second Flush Tea', 'Kalimpong Cheese', 'Dalle Chilli Paste', 'Hill Mandarin Honey'],
    introText:
      'Perched in the mist-wrapped West Bengal hills between Kurseong, Darjeeling, and Kalimpong, estates and artisan studios blend centuries-old tea cultivation with Eastern Himalayan craft. Single-estate Darjeeling gardens harvest delicate spring first flush and muscatel second flush whole leaves prized worldwide for complex floral aromatics. Nearby in Kalimpong and Mirik, cooperative studios weave natural-dyed textiles, hand-knotted woollen carpets, textured Lokta paper journals, and artisan felted wool accessories. Family dairies and farm kitchens also turn crisp mountain milk and orchard produce into aged Kalimpong cheese, orange-blossom honey, and fiery Dalle chilli condiments. Every estate and studio listing specifies elevation zone, processing batch, and verified seller details.',
    faqs: [
      {
        question: 'What is the difference between Darjeeling First Flush and Second Flush tea?',
        answer:
          'First Flush (March–April) gives a pale golden liquor with brisk floral notes, while Second Flush (May–June) yields richer amber cups with signature muscatel grape sweetness.',
      },
      {
        question: 'How do I know Darjeeling tea or Kalimpong cheese is genuinely from the hills?',
        answer:
          'Look for garden or cooperative origin details on the listing and verified GI documentation where claimed; unverified GI labels are blocked by platform moderation.',
      },
    ],
  },
];

export const DEFAULT_HIMALAYAN_CRAFTS: SeedCraftDef[] = [
  {
    id: 'crf_pashmina',
    name: 'Pashmina Shawls',
    slug: 'pashmina-shawls',
    heroImage: '/images/product-shawl.jpg',
    sortOrder: 10,
    introText:
      'Hand-spun and handwoven from ultra-fine Changthangi underfleece combed in high-altitude Ladakh and crafted by master weavers and embroiderers in Kashmir.',
    history:
      'Originating across centuries-old trade routes connecting Changthang herdsmen with Srinagar looms, genuine Cashmere/Pashmina yarn averages 12 to 15 microns—finer than human hair—making each shawl remarkably featherweight yet deeply insulating.',
    howToIdentify:
      'Authentic handloom Pashmina feels warm rather than plasticky, has slight organic weave irregularity, never glides smoothly through a tight metal ring if thick Kani-woven, and burns like hair with an earthy keratin odour rather than melting into hard plastic beads.',
    faqs: [
      {
        question: 'How can I identify genuine handloom Pashmina from machine-made viscose?',
        answer:
          'Check for hand-spun yarn slubs visible under strong light, soft matte warmth (never shiny acrylic sheen), and verified origin or lab testing records before trusting "pure pashmina" claims.',
      },
      {
        question: 'Why are genuine handwoven Pashmina shawls higher priced?',
        answer:
          'Each shawl requires painstaking hand-sorting of undercoat guard hairs, hand-spinning on wooden wheels, and weeks to months of shuttle weaving plus optional Sozni hand embroidery.',
      },
    ],
  },
  {
    id: 'crf_kullu_kinnauri',
    name: 'Kullu & Kinnauri Shawls',
    slug: 'kullu-kinnauri-shawls',
    heroImage: '/images/weaving.jpg',
    sortOrder: 20,
    introText:
      'Traditional Himachali woollen shawls woven on pit and frame looms with geometric borders in Kullu and intricate sacred motifs in Kinnaur.',
    history:
      'Settled Bushehri and Kullu weaving families blended local Desar sheep fleece with vibrant natural dyes to guard against harsh mountain winters, earning Geographical Indication protection for both Kullu and Kinnauri shawls.',
    howToIdentify:
      'Inspect the reverse side of the colourful border patterns: handwoven extra-weft borders leave clean woven floats and crisp interlocks without glued adhesive backing or printed ink.',
    faqs: [
      {
        question: 'What is the main visual difference between Kullu and Kinnauri shawls?',
        answer:
          'Kullu shawls usually feature bold triple-band geometric motifs confined near both ends, while Kinnauri shawls carry dense multi-colour religious and nature motifs across wider panels or even the full body.',
      },
    ],
  },
  {
    id: 'crf_himalayan_tea',
    name: 'Himalayan Teas & Infusions',
    slug: 'himalayan-tea',
    heroImage: '/images/product-tea.jpg',
    sortOrder: 30,
    introText:
      'Orthodox whole-leaf spring and summer teas grown across misty slopes in Kangra (Himachal Pradesh), Darjeeling (West Bengal hills), and Temi (Sikkim).',
    history:
      'Introduced to Himalayan foothills in the mid-19th century, slow cool-night leaf growth creates delicate aromatic essential oils unmatched by flatland CTC dust teas.',
    howToIdentify:
      'True orthodox Himalayan tea consists of unfurling whole leaves and silver buds rather than crushed dust pellets, steeping into clear golden-to-amber liquor with floral or muscatel notes.',
    faqs: [
      {
        question: 'How do Kangra, Darjeeling, and Sikkim orthodox teas differ in taste?',
        answer:
          'Kangra tea offers smooth green/black floral sweetness with minimal bitterness; Darjeeling highlights brisk spring citrus or rich muscatel; Sikkim Temi tea balances crisp orchard aroma with velvety body.',
      },
    ],
  },
  {
    id: 'crf_himalayan_honey',
    name: 'Himalayan Honey & Hive Craft',
    slug: 'himalayan-honey',
    heroImage: '/images/product-honey.jpg',
    sortOrder: 40,
    introText:
      'Raw, unheated mountain honey harvested by hillside beekeepers across Lahaul, Mandi, Kumaon, Garhwal, Kashmir, and Eastern Himalayan forests.',
    history:
      'Traditional log hives (*kothis*) and migratory boxes harness short bursts of wild white-clover, acacia, buckwheat, and rhododendron blossom nectar.',
    howToIdentify:
      'Unheated raw honey retains fine pollen flecks and often crystallizes smoothly in cold winters—crystallization signals minimal heat processing, not sugar adulteration.',
    faqs: [
      {
        question: 'Why does pure Himalayan honey crystallize in winter?',
        answer:
          'Natural glucose in raw unheated mountain nectar separates cleanly when ambient temperatures drop below 15°C; gentle warm water immersion restores fluidity without boiling.',
      },
    ],
  },
  {
    id: 'crf_aipan',
    name: 'Aipan Ritual Art',
    slug: 'aipan-art',
    heroImage: '/images/editorial-terrace.jpg',
    sortOrder: 50,
    introText:
      'Iconic Kumaoni sacred geometric art painted by hand in white biswar (rice paste) motifs over deep terracotta ochre backgrounds in Uttarakhand.',
    history:
      'Practiced for generations by women across Almora, Nainital, and Pithoragarh courtyards for festivals and ceremonies, Aipan received Geographical Indication recognition to protect community livelihoods.',
    howToIdentify:
      'True hand-painted Aipan features crisp hand-drawn concentric mandalas, conch shells, footsteps of Lakshmi, and delicate white dots showing subtle brush stroke rhythm.',
    faqs: [
      {
        question: 'What surfaces do artisans create authentic Aipan art on today?',
        answer:
          'Alongside traditional floor and wall panels, Kumaoni artisans hand-paint durable wooden trays, wall frames, puja thalis, terracotta diyas, and cotton table runners.',
      },
    ],
  },
  {
    id: 'crf_chamba_rumal',
    name: 'Chamba Rumal Embroidery',
    slug: 'chamba-rumal',
    heroImage: '/images/makers-hands.jpg',
    sortOrder: 60,
    introText:
      'Double-sided silk-on-muslin miniature needle painting from Chamba in Himachal Pradesh, stitched using *do-rukha* satin stitches so both faces look identical.',
    history:
      'Patronised since the 17th century by Chamba hill ateliers alongside Pahari miniature painters, artists first outline compositions in fine charcoal before master embroiders fill unbroken silk threads.',
    howToIdentify:
      'Flip the unframed muslin cloth over: true *do-rukha* Chamba Rumal reveals virtually mirror-image silk motifs with zero messy knotted threads on the reverse.',
    faqs: [
      {
        question: 'Why does genuine Chamba Rumal look identical on both sides?',
        answer:
          'Artisans work a tight forward-and-back double satin stitch (*do-rukha*) without loose knots on unbleached handspun khadi muslin.',
      },
    ],
  },
  {
    id: 'crf_thangka',
    name: 'Thangka Scroll Art',
    slug: 'thangka-painting',
    heroImage: '/images/editorial-spinning.jpg',
    sortOrder: 70,
    introText:
      'Sacred Himalayan Buddhist scroll paintings rendered on prepared cotton canvas with mineral pigments and fine gold detailing in Ladakh, Spiti, Sikkim, and Dharamshala.',
    history:
      'Rooted in monastic iconographic proportion grids (*thig-tse*), master painters prepare gessoed cotton stretched inside wooden frames and grind stone azurite, malachite, and vermilion pigments.',
    howToIdentify:
      'Genuine hand-painted Thangkas reveal raised brush layers, ultra-fine gold shading lines, and uneven woven cloth backing rather than flat glossy inkjet dots.',
    faqs: [
      {
        question: 'How long does it take to paint an authentic Thangka?',
        answer:
          'Depending on canvas size and gold leaf detail, hand-painted Thangkas take anywhere from four weeks to several months of uninterrupted studio work.',
      },
    ],
  },
  {
    id: 'crf_lepcha',
    name: 'Lepcha & Eastern Backstrap Weaving',
    slug: 'lepcha-weaving',
    heroImage: '/images/home/himalayan-artisan-workshop.jpg',
    sortOrder: 80,
    introText:
      'Dense, colour-striped handloom textiles woven on bamboo-and-wood backstrap looms by Lepcha artisans in Sikkim and indigenous weavers across Arunachal Pradesh.',
    history:
      'Originally spun from Himalayan nettle fibres and wild cotton, vibrant rhythmic warp stripes express clan identity and woodland ecology in tightly ribbed fabric built to endure decades.',
    howToIdentify:
      'Backstrap textiles have selvedges naturally bound at the loom edge and bold crisp warp stripes woven straight into the cloth structure, never printed onto plain fabric.',
    faqs: [
      {
        question: 'Why are backstrap loom panels narrower than wide powerloom sheets?',
        answer:
          'Tension is held across the weaver’s own waist and reach, creating characteristic 16-to-22-inch panels later joined seamlessly for throws, jackets, and ceremonial bags.',
      },
    ],
  },
  {
    id: 'crf_wood_walnut',
    name: 'Himalayan Wood & Walnut Carving',
    slug: 'wood-and-walnut-craft',
    heroImage: '/images/maker-sunset-studio.jpg',
    sortOrder: 90,
    introText:
      'Seasoned deodar, walnut, and apricot wood boxes, bowls, lattice screens, and carved Choktse folding tables shaped by Kashmiri, Himachali, Ladakhi, and Sikkimese woodworkers.',
    history:
      'Abundant high-altitude walnut trees and fragrant Himalayan cedar encouraged generations of chisel-craft across Srinagar, Chamba, Kinnaur, Leh, and Gangtok.',
    howToIdentify:
      'Real carved walnut and deodar displays continuous natural grain running through carved petals and subtle chisel tool marks under beeswax oil finish, unlike cast resin moulds.',
    faqs: [
      {
        question: 'How should buyers care for hand-carved Himalayan woodcraft?',
        answer:
          'Wipe gently with a dry soft cloth, keep away from direct radiators or prolonged dampness, and nourish annually with a drop of beeswax or food-safe walnut oil.',
      },
    ],
  },
];
