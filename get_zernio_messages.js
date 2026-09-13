import https from 'https';

const apiKey = 'sk_895a0c3cf6da498f854c000ef72860d0ca5f5c313464055e44e07454a50cfa7a';
const convId = '6aa6362f726ebfe037e31a7c';
const accountId = '6aa6362b726ebfe037e31a6b';

const req = https.request(`https://api.zernio.com/v1/inbox/conversations/${convId}/messages?accountId=${accountId}&limit=5`, {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json'
  }
}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      const items = parsed.messages || parsed.data?.messages || parsed.data || [];
      console.log('Items count:', items.length);
      for (const it of items) {
        console.log('--- Message ---');
        console.log('ID:', it.id || it._id);
        console.log('Text:', it.message || it.text);
        console.log('Attachments / Media:', it.attachments, it.media, it.mediaUrls, it.mediaUrl);
      }
    } catch (e) {
      console.log('Body:', body);
    }
    process.exit(0);
  });
});

req.on('error', console.error);
req.end();
