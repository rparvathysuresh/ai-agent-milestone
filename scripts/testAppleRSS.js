// Test different Apple RSS URL formats for Groww
const urls = [
  'https://itunes.apple.com/rss/customerreviews/id=1404855753/sortBy=mostRecent/json',
  'https://itunes.apple.com/us/rss/customerreviews/page=1/id=1404855753/sortby=mostrecent/json',
  'https://itunes.apple.com/in/rss/customerreviews/page=1/id=1404855753/json',
];

for (const url of urls) {
  try {
    console.log(`\nTrying: ${url}`);
    const r = await fetch(url);
    console.log(`Status: ${r.status}`);
    if (r.ok) {
      const d = await r.json();
      const entries = d?.feed?.entry;
      console.log(`Entries: ${entries ? entries.length : 0}`);
      if (entries && entries.length > 0) {
        const sample = entries.find(e => e['im:rating']);
        if (sample) {
          console.log(`Sample: rating=${sample['im:rating']?.label}, title=${sample.title?.label}`);
        }
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
