// Test script
(async () => {
  const url = 'https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_tournament.php?cmd=get_list&keyword=agawa';
  console.log('Testing API from browser context...');
  const res = await fetch(url, { credentials: 'include' });
  const data = await res.json();
  console.log('Response:', data);
  console.log('Has result key:', 'result' in data);
  console.log('Is array:', Array.isArray(data));
  if (Array.isArray(data)) console.log('Length:', data.length);
})();
