const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const frontendDir = path.join(__dirname, '..', 'dist', 'news-analyser', 'browser');

const trustedDomains = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'bbc.co.uk',
  'thehindu.com',
  'indianexpress.com',
  'nytimes.com',
  'theguardian.com'
];

const riskyPhrases = [
  'shocking truth',
  'you will not believe',
  'doctors hate',
  'secret plan',
  'mainstream media won',
  'exposed',
  'miracle cure',
  '100% guaranteed',
  'viral claim'
];

const strongClaimWords = [
  'always',
  'never',
  'everyone',
  'nobody',
  'destroyed',
  'proves',
  'guaranteed',
  'secret',
  'banned'
];

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(JSON.stringify(data));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  response.end(html);
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(response, 404, { error: 'File not found.' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[extension] || 'application/octet-stream'
    });
    response.end(content);
  });
}

function serveFrontend(request, response) {
  const indexPath = path.join(frontendDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    sendHtml(response, 200, `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>News Analyser API</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #f6f7f9; color: #17202a; }
            main { max-width: 720px; margin: 60px auto; padding: 28px; background: white; border: 1px solid #dde3ea; border-radius: 8px; }
            h1 { margin-top: 0; }
            code { background: #eef1f4; padding: 3px 6px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <main>
            <h1>News Analyser backend is running</h1>
            <p>Build the frontend first, then refresh this page:</p>
            <p><code>npm.cmd run build</code></p>
            <p>Or run everything with:</p>
            <p><code>npm.cmd run app</code></p>
          </main>
        </body>
      </html>
    `);
    return;
  }

  const requestPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const safePath = path.normalize(requestPath).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
  const requestedFile = path.join(frontendDir, safePath === '' ? 'index.html' : safePath);
  const finalPath = requestedFile.startsWith(frontendDir) && fs.existsSync(requestedFile)
    ? requestedFile
    : indexPath;

  sendFile(response, finalPath);
}

function repairMojibake(value) {
  if (!/[ÃÂâà]/.test(value)) {
    return value;
  }

  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  const originalNoise = (value.match(/[ÃÂâà]/g) || []).length;
  const repairedNoise = (repaired.match(/[ÃÂâà]/g) || []).length;
  return repairedNoise < originalNoise ? repaired : value;
}

function stableRepairMojibake(value) {
  if (!/[\u00c3\u00c2\u00e2\u00e0]/.test(value)) {
    return value;
  }

  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  const originalNoise = (value.match(/[\u00c3\u00c2\u00e2\u00e0]/g) || []).length;
  const repairedNoise = (repaired.match(/[\u00c3\u00c2\u00e2\u00e0]/g) || []).length;
  return repairedNoise < originalNoise ? repaired : value;
}

function normaliseText(value) {
  return stableRepairMojibake(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/\u00e2\u0080\u0099/g, "'")
    .replace(/\u00e2\u0080\u0098/g, "'")
    .replace(/\u00e2\u0080\u009c/g, '"')
    .replace(/\u00e2\u0080\u009d/g, '"')
    .replace(/\u00e2\u0080\u0093/g, '-')
    .replace(/\u00e2\u0080\u0094/g, '-')
    .replace(/\u00f0\u009f[\s\S]{0,4}/g, ' ')
    .replace(/â/g, "'")
    .replace(/â/g, "'")
    .replace(/â/g, '"')
    .replace(/â/g, '"')
    .replace(/â/g, '-')
    .replace(/â/g, '-')
    .replace(/ð[\s\S]{0,4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(skip to content|sign in|subscribe|edition|sections)\b/gi, ' ')
    .split(' ')
    .filter((word) => word.length < 40)
    .join(' ');
}

function extractTitle(html) {
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogTitleMatch) {
    return normaliseText(ogTitleMatch[1]);
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    return 'Untitled article';
  }
  return normaliseText(titleMatch[1]);
}

function extractFirstUrl(value) {
  const match = String(value || '').match(/https?:\/\/[^\s]+/i);
  if (!match) {
    return '';
  }

  let cleanUrl = match[0].replace(/[),.]+$/, '');

  try {
    const parsedUrl = new URL(cleanUrl);
    const articleIdMatch = parsedUrl.pathname.match(/^(.*?-\d+\/)/);
    if (articleIdMatch) {
      parsedUrl.pathname = articleIdMatch[1];
      parsedUrl.search = '';
      parsedUrl.hash = '';
      cleanUrl = parsedUrl.toString();
    }
  } catch {
    return cleanUrl;
  }

  return cleanUrl;
}

function getCharset(contentType) {
  const match = contentType.match(/charset=([^;]+)/i);
  const charset = match ? match[1].trim().toLowerCase() : 'utf-8';
  return charset.includes('utf') ? charset : 'utf-8';
}

function countMatches(text, words) {
  const lowerText = text.toLowerCase();
  return words.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0);
}

function analyseArticle(url, title, text) {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const isTrustedDomain = trustedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  const riskyPhraseCount = countMatches(`${title} ${text}`, riskyPhrases);
  const strongClaimCount = countMatches(`${title} ${text}`, strongClaimWords);
  const hasDate = /\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);
  const hasAttribution = /\b(according to|said|reported|statement|agency|official|research|study)\b/i.test(text);
  const hasManyCaps = (title.match(/[A-Z]{4,}/g) || []).length > 1;
  const hasQuestionablePunctuation = /[!?]{2,}/.test(title);

  let riskScore = 45;
  const reasons = [];

  if (isTrustedDomain) {
    riskScore -= 25;
    reasons.push('The link is from a commonly trusted news domain.');
  } else {
    riskScore += 10;
    reasons.push('The source is not in the small trusted-domain list used by this demo.');
  }

  if (riskyPhraseCount > 0) {
    riskScore += riskyPhraseCount * 12;
    reasons.push('The article contains clickbait or sensational phrases.');
  }

  if (strongClaimCount > 1) {
    riskScore += strongClaimCount * 4;
    reasons.push('The wording uses several absolute or exaggerated claims.');
  }

  if (!hasDate) {
    riskScore += 10;
    reasons.push('No clear publication date was detected in the article text.');
  }

  if (!hasAttribution) {
    riskScore += 12;
    reasons.push('The article has weak visible attribution, quotes, or evidence markers.');
  }

  if (hasManyCaps || hasQuestionablePunctuation) {
    riskScore += 8;
    reasons.push('The headline formatting looks sensational.');
  }

  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  let verdict = 'Likely Real';
  if (riskScore >= 70) {
    verdict = 'High Fake Risk';
  } else if (riskScore >= 45) {
    verdict = 'Needs Verification';
  }

  return {
    url,
    hostname,
    title,
    verdict,
    riskScore,
    confidence: riskScore >= 70 || riskScore <= 30 ? 'Medium' : 'Low',
    reasons,
    preview: text.slice(0, 500)
  };
}

async function handleAnalyse(request, response) {
  let body = '';

  request.on('data', (chunk) => {
    body += chunk;
  });

  request.on('end', async () => {
    try {
      const { url } = JSON.parse(body || '{}');
      const cleanUrl = extractFirstUrl(url);

      if (!cleanUrl) {
        sendJson(response, 400, { error: 'Please provide a news URL.' });
        return;
      }

      const parsedUrl = new URL(cleanUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        sendJson(response, 400, { error: 'Only http and https links are supported.' });
        return;
      }

      const articleResponse = await fetch(parsedUrl, {
        redirect: 'follow',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-IN,en;q=0.9',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 NewsAnalyserStudentProject/1.0'
        }
      });

      if (!articleResponse.ok) {
        sendJson(response, 502, { error: `Could not fetch article. Status: ${articleResponse.status}` });
        return;
      }

      const contentType = articleResponse.headers.get('content-type') || '';
      const bytes = await articleResponse.arrayBuffer();
      const html = new TextDecoder(getCharset(contentType)).decode(bytes);
      const title = extractTitle(html);
      const text = normaliseText(extractText(html));

      if (text.length < 200) {
        sendJson(response, 422, { error: 'The page did not contain enough readable article text.' });
        return;
      }

      sendJson(response, 200, analyseArticle(parsedUrl.toString(), title, text));
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Something went wrong while analysing the link.' });
    }
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    response.end();
    return;
  }

  if (request.method === 'POST' && request.url === '/api/analyse') {
    handleAnalyse(request, response);
    return;
  }

  if (request.method === 'GET') {
    serveFrontend(request, response);
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
});

server.listen(PORT, () => {
  console.log(`News analyser API running at http://localhost:${PORT}`);
});
