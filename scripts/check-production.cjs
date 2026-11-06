async function check() {
  try {
    const res = await fetch('https://www.dearhills.in/api/home');
    console.log('Production /api/home status:', res.status);
    const data = await res.json();
    console.log('Production categories count:', data.categories ? data.categories.length : 0);
    console.log('Production featured count:', data.featured ? data.featured.length : 0);
    console.log('Production bestsellers count:', data.bestsellers ? data.bestsellers.length : 0);
    console.log('Production makers count:', data.makers ? data.makers.length : 0);

    const htmlRes = await fetch('https://www.dearhills.in/');
    const html = await htmlRes.text();
    console.log('Production HTML length:', html.length);
    
    // Check asset links in production HTML
    const scriptMatches = html.match(/\/assets\/[^"]+/g);
    console.log('Production scripts / assets referenced:', scriptMatches);
  } catch (e) {
    console.log('Error checking prod:', e.message);
  }
}
check();
