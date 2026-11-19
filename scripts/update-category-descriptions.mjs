#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'data', 'pahadi-roots.db');
const db = new DatabaseSync(dbPath);

const DESCRIPTIONS = {
  'shawls-and-weaves':
    'Himachal Pradesh’s handloom weaving tradition is a living testament to high-altitude artisan mastery. Centered in the cold valleys of Kullu and Kinnaur, master weavers work on traditional wooden pit looms to craft generous wool shawls, stoles, and blankets using pure indigenous sheep wool and fine Merino fibers. Kullu shawls are world-renowned for their distinctive geometric border patterns woven with vegetable-dyed accents, while Kinnauri shawls feature sacred Buddhist and Himalayan motifs requiring up to three months of painstaking manual handwork. Every piece in our collection is sourced directly from certified artisan cooperatives and family weaving clusters, ensuring verified authenticity, zero synthetic blends, and ethical compensation that preserves this endangered Himalayan heritage for future generations.',

  'tea-and-infusions':
    'Nestled beneath the majestic snow peaks of the Dhauladhar range, the Kangra Valley produces some of the rarest and most exquisite orthodox teas in the world. Introduced in the mid-19th century using Chinese Camellia sinensis cultivars, Kangra tea holds a prestigious Geographical Indication (GI) tag. The high-altitude terroir, mineral-rich Himalayan glacial runoff, and dramatic day-to-night temperature shifts create first and second flush black and green teas celebrated for their delicate golden liquor, sweet muscatel undertones, and vibrant floral aroma. Unlike mass-commercial CTC dust teas, Dear Hills offers only whole-leaf, small-batch harvests plucked by generational tea plucking families and slow-withered in historic mountain estates, delivering unmatched purity and potent natural antioxidants in every brew.',

  'dry-fruit-and-nuts':
    'Harvested in the remote alpine micro-climates of Kinnaur, Spiti, and the upper Shimla belt, our Himalayan dry fruits and nuts thrive in clean mountain air and pure glacial waters. Himalayan wild apricots (chuli) and thin-shelled cold-desert walnuts are naturally sun-dried on flat kathkuni village rooftops without chemical sulfur bleaching, artificial sweeteners, or preservatives. Kinnaur walnuts are renowned for their extraordinarily high polyunsaturated fatty acid and omega-3 oil content, yielding a rich, buttery crunch impossible to replicate in industrial plains farming. Our sweet apricot kernels, sun-dried wild figs, and hand-cracked almonds offer nourishing mountain sustenance packed with natural vitamins, minerals, and plant-based energy.',

  'pantry-and-preserves':
    'Our Himalayan honey is gathered directly from indigenous wild bee colonies foraging across pristine sub-alpine forests and flowering orchards. Never heated, ultra-filtered, or adulterated with commercial sugar syrups, this raw mountain honey retains its active pollen enzymes, propolis, royal jelly compounds, and rich floral complexity. Alongside pure honey, our pantry collection features small-batch orchard fruit jams and traditional mountain pickles slow-simmered in cold-pressed mustard oil with wild Himalayan spices like jakhiya, timbur (Sichuan pepper), and asafoetida. Each jar captures the seasonal sweetness and rugged terroir of high-altitude fruit valleys, providing authentic mountain flavor and natural vitality.',

  'cold-pressed-oils':
    'Extracted using time-honored wooden press (kohlus) techniques that operate without external heat or chemical solvent refining, our cold-pressed mountain oils preserve their complete vitamin E and essential fatty acid profiles. Wild apricot kernel oil (gutthi ka tel) is a cherished Himalayan panacea, traditionally used for deep skin nourishment, natural joint relief, and restorative hair wellness. Our virgin walnut oil and stone-ground yellow mustard oil are celebrated for their rich culinary warmth, deep golden hues, and potent heart-healthy omegas. Sourced directly from village processing units across Kinnaur and Mandi, every bottle represents pristine botanical extraction in its purest, most wholesome form.',

  'pulses-and-staples':
    'Grown on high-altitude terraced fields nurtured solely by snowmelt and natural compost, Himalayan pulses possess distinctive culinary textures and deep, earthy flavors. Famous Chamba rajma (red kidney beans), grown at elevations above 6,000 feet, cook into an exceptionally creamy, easily digestible gravy without heavy spicing. Our mountain pantry includes pure Shilajit resin hand-harvested from high rock cliffs, crimson Kashmiri saffron, stone-ground unpolished red rice (chhohartu), and heritage grains like finger millet (kodra) and amaranth. Rich in bioavailable proteins, dietary fiber, and rare trace minerals, these ancient staples represent centuries of regenerative, chemical-free alpine mountain agriculture.',

  'knitwear':
    'Crafted by women artisans during the snowbound winter months in Kinnaur, Lahaul, and Spiti, our hand-knitted woolen collection provides genuine alpine warmth. Using thick hand-spun sheep wool and soft natural fibers, village knitters handcraft durable woolen socks, cozy ribbed mufflers, fingerless gloves, and snug beanies designed to withstand sub-zero Himalayan blizzards. Hand-knitting is a communal village tradition where stories, folklore, and intricate cable patterns are shared around wood-burning bukhari stoves. Every item provides superior thermal insulation, natural moisture-wicking breathability, and rustic mountain durability that outlasts factory-made synthetics by decades.',

  'caps-and-headwear':
    'The Himachali cap (topi) is an iconic symbol of mountain dignity, cultural pride, and valley heritage. Distinct variations have evolved across each valley: the vibrant, geometric patterned border of the Kulluvi cap reflects folk weave traditions, while the royal Bushahri cap from upper Shimla and Kinnaur is distinguished by its rich velvet band, traditionally adorned with monal crests or fresh mountain flowers during temple fairs and village festivals. Tailored from warm pure wool with sturdy internal stiffening, our traditional headwear is handcrafted by seasoned master tailors using authentic local fabrics. Wearing a Himachali cap connects you to centuries of folk living traditions, welcoming hospitality, and enduring regional identity.',

  'gifting':
    'Curated to bring the warmth, aroma, and craftsmanship of the mountains into your celebrations, our bespoke Himalayan gift sets combine rare regional treasures. Packaged in reusable wooden pine boxes and eco-friendly mountain fiber wrapping, each collection pairs heritage handloom pieces with gourmet pantry luxuries like single-estate Kangra orthodox tea, wild forest honey, and crunchy Kinnaur dry fruits. Whether celebrating seasonal festivities, weddings, family milestones, or corporate appreciation, Dear Hills gift boxes convey intentional thoughtfulness, direct artisan impact, and authentic Himalayan prestige that mass-produced commercial hampers simply cannot match.',

  'fruits-and-fresh-produce':
    'Himachal Pradesh is rightfully known as India’s premier fruit basket. Our seasonal orchards, perched on steep sunny mountain slopes between 5,000 and 9,000 feet, produce crisp Kinnaur Royal Delicious apples, golden Russet pears, sun-ripened wild apricots, and sweet mountain cherries. Slower maturation caused by cool alpine nights and intense mountain sunshine concentrates natural sugars, yielding crisp texture and unforgettable aromatic flavor. We collaborate directly with smallholder orchardist families who follow sustainable, low-intervention horticultural practices, harvesting fruit at peak physiological ripeness and dispatching carefully in climate-adapted protective packaging straight to your door.',

  'crafts-and-handicrafts':
    'From intricately carved deodar cedar woodwork that mimics ancient kathkuni temple architecture to hand-coiled wild pine needle baskets and hand-beaten brass and copper utensils, Himachal Pradesh possesses a rich lineage of sacred and utilitarian craftsmanship. Mountain artisans transform sustainably harvested local materials into heirloom pieces that honor the elements of the Himalayas. Pine needle basketry provides vital seasonal income to rural women self-help groups, while traditional woodcarving preserves folk artistic motifs passed down through family guilds. By choosing genuine handicrafts through Dear Hills, you bring authentic mountain artistry into your home while directly supporting the economic resilience of indigenous Himalayan maker communities.',

  'traditional-goods-and-essentials':
    'Rooted in centuries of Himalayan temple rituals and sustainable mountain living, our collection of traditional goods brings mountain serenity into your sacred spaces. Discover pure Himalayan dhoop prepared with sacred juniper (dhup), guggul resin, and wild aromatic herbs, completely free from synthetic chemical fragrances or charcoal. Explore hand-carved stone cooking vessels, copper ritual accessories, and regional home essentials handmade by generational mountain metalworkers and artisans. Each item embodies reverence for nature, clean energetic purity, and authentic pahadi hospitality.',
};

for (const [slug, desc] of Object.entries(DESCRIPTIONS)) {
  const words = desc.trim().split(/\s+/).length;
  db.prepare('UPDATE categories SET description = ? WHERE slug = ?').run(desc, slug);
  console.log(`Updated category "${slug}": ${words} words`);
}

console.log('All categories successfully updated with 100-150 word SEO introductions.');
