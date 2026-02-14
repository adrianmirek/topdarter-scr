const testUrls = [
  'https://n01darts.com/n01/tournament/script/n01_tournament.php?cmd=get_list&keyword=agawa',
  'https://n01darts.com/n01/tournament/n01_tournament.php?cmd=get_list&keyword=agawa',
  'https://n01darts.com/script/n01_tournament.php?cmd=get_list&keyword=agawa'
];

for (const url of testUrls) {
  console.log('Testing:', url);
  try {
    const res = await fetch(url);
    const text = await res.text();
    console.log('Status:', res.status, res.statusText);
    console.log('Response preview:', text.substring(0, 200));
  } catch (e) {
    console.log('Error:', e.message);
  }
}
