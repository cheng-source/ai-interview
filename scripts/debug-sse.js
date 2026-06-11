// 调试脚本：观察单个面试的完整 SSE 流
var fs = require('fs');
var d = JSON.parse(fs.readFileSync('./scripts/results/test-data.json', 'utf8'));

async function main() {
  var it = d[0];
  var url = 'http://localhost:3000/api/interviews/' + it.interviewId + '/start?token=' + it.accessToken;

  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText: it.resumeText }),
  });
  console.log('HTTP', res.status);

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buffer = '';
  var t0 = Date.now();

  var timer = setTimeout(function () {
    reader.cancel();
    console.log('\nTIMEOUT');
    process.exit(0);
  }, 15000);

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) {
      console.log('DONE');
      clearTimeout(timer);
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('data:')) {
        try {
          var data = JSON.parse(lines[i].slice(5).trim());
          var short = JSON.stringify(data).slice(0, 250);
          console.log('[' + (Date.now() - t0) + 'ms] ' + data.type + ' | ' + (data.stage || '') + ' | ' + short);
        } catch (e) {
          console.log('RAW:', lines[i].slice(0, 100));
        }
      }
    }
  }
}
main();
