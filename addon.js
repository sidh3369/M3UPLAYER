const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 10000;
const MEDIA_FILE = path.join(__dirname, 'media.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

function loadMedia() {
  try {
    return JSON.parse(fs.readFileSync(MEDIA_FILE)) || { m3uUrl: '' };
  } catch (e) {
    console.error('Error loading media:', e.message);
    return { m3uUrl: '' };
  }
}

function saveMedia(data) {
  try {
    fs.writeFileSync(MEDIA_FILE, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving media:', e.message);
  }
}

async function parseM3U(url) {
  try {
    console.log(`Fetching M3U: ${url}`);
    const response = await axios.get(url, { timeout: 10000 });
    console.log(`M3U response: ${response.status}`);
    const lines = response.data.split('\n').map(line => line.trim()).filter(line => line);
    const streams = [];
    let name = 'Stream';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#EXTINF:')) {
        const match = lines[i].match(/,(.+)/) || lines[i].match(/tvg-name="(.+?)"/);
        name = match ? match[1].trim() : `Stream ${streams.length + 1}`;
      } else if (!lines[i].startsWith('#') && lines[i].match(/^https?:\/\//)) {
        streams.push({ name, url: lines[i] });
        console.log(`Parsed stream: ${name} - ${lines[i]}`);
        name = 'Stream';
      }
    }
    console.log(`Total streams parsed: ${streams.length}`);
    return streams;
  } catch (e) {
    console.error(`Error parsing M3U ${url}: ${e.message}`);
    return [];
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.post('/set-m3u', (req, res) => {
  const { m3uUrl } = req.body;
  if (!m3uUrl) return res.json({ success: false, error: 'M3U URL required' });
  console.log(`Saving M3U URL: ${m3uUrl}`);
  const media = loadMedia();
  media.m3uUrl = m3uUrl;
  saveMedia(media);
  res.json({ success: true, message: 'M3U URL saved' });
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'sidh3369.simplem3u',
    version: '1.0.0',
    name: 'SimpleM3U',
    description: 'Play M3U playlists in Stremio',
    resources: ['catalog', 'stream'],
    types: ['movie'],
    catalogs: [{ type: 'movie', id: 'm3u_catalog' }],
    behaviorHints: {}
  });
});

app.get('/catalog/:type/:id.json', async (req, res) => {
  const media = loadMedia();
  console.log(`Catalog requested, m3uUrl: ${media.m3uUrl}`);
  if (!media.m3uUrl) return res.json({ metas: [] });
  res.json({
    metas: [{
      id: 'm3u_playlist',
      name: 'M3U Playlist',
      type: 'movie',
      poster: 'https://via.placeholder.com/150?text=Playlist'
    }]
  });
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const media = loadMedia();
  console.log(`Stream requested, id: ${req.params.id}, m3uUrl: ${media.m3uUrl}`);
  if (!media.m3uUrl) return res.json({ streams: [] });
  const streams = await parseM3U(media.m3uUrl);
  if (req.params.id === 'm3u_playlist') {
    const streamList = streams.map((stream, index) => ({
      title: stream.name,
      url: stream.url,
      externalUrl: `stremio:///detail/movie/m3u_playlist/m3u_stream_${index}`,
      behaviorHints: { bingeGroup: 'm3u_playlist' }
    }));
    console.log(`Returning ${streamList.length} streams for playlist`);
    return res.json({ streams: streamList });
  }
  const streamIndex = parseInt(req.params.id.replace('m3u_stream_', ''), 10);
  if (streamIndex >= 0 && streamIndex < streams.length) {
    const stream = streams[streamIndex];
    console.log(`Returning single stream: ${stream.name}`);
    return res.json({
      streams: [{
        title: stream.name,
        url: stream.url,
        behaviorHints: { bingeGroup: 'm3u_playlist' }
      }]
    });
  }
  console.log('No matching stream found');
  res.json({ streams: [] });
});

app.listen(PORT, () => {
  console.log(`✅ SimpleM3U running on http://localhost:${PORT}`);
});
