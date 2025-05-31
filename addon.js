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
    return JSON.parse(fs.readFileSync(MEDIA_FILE));
  } catch (e) {
    return { m3uUrl: '' };
  }
}

function saveMedia(data) {
  try {
    fs.writeFileSync(MEDIA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error saving media:', e.message);
  }
}

async function parseM3U(url) {
  try {
    const response = await axios.get(url);
    const lines = response.data.split('\n');
    const streams = [];
    let currentStream = null;
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const nameMatch = line.match(/,(.+)/);
        currentStream = { name: nameMatch ? nameMatch[1].trim() : 'Unnamed Stream' };
      } else if (line && !line.startsWith('#') && currentStream) {
        currentStream.url = line.trim();
        streams.push(currentStream);
        currentStream = null;
      }
    }
    return streams;
  } catch (e) {
    console.error('Error parsing M3U:', e.message);
    return [];
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.post('/set-m3u', async (req, res) => {
  const { m3uUrl } = req.body;
  if (!m3uUrl) {
    return res.json({ success: false, error: 'M3U URL required' });
  }
  const media = loadMedia();
  media.m3uUrl = m3uUrl;
  saveMedia(media);
  console.log('M3U URL saved:', m3uUrl);
  res.json({ success: true, message: 'M3U URL saved' });
});

app.get('/manifest.json', (req, res) => {
  res.json({
    id: 'sidh3369.m3uplayer',
    version: '1.0.0',
    name: 'M3UPLAYER',
    description: 'Play M3U playlists in Stremio',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie'],
    catalogs: [{ type: 'movie', id: 'm3u_catalog' }],
    behaviorHints: {}
  });
});

app.get('/catalog/:type/:id/:extra?.json', async (req, res) => {
  const media = loadMedia();
  if (!media.m3uUrl) {
    return res.json({ metas: [] });
  }
  res.json({
    metas: [{
      id: 'm3u_playlist',
      name: 'M3U Playlist',
      type: 'movie',
      poster: 'https://via.placeholder.com/150?text=M3U+Playlist'
    }]
  });
});

app.get('/meta/:type/:id.json', async (req, res) => {
  const media = loadMedia();
  if (!media.m3uUrl || req.params.id !== 'm3u_playlist') {
    return res.json({});
  }
  const streams = await parseM3U(media.m3uUrl);
  res.json({
    meta: {
      id: 'm3u_playlist',
      name: 'M3U Playlist',
      type: 'movie',
      poster: 'https://via.placeholder.com/150?text=M3U+Playlist',
      videos: streams.map((stream, index) => ({
        id: `m3u_stream_${index}`,
        title: stream.name,
        released: new Date().toISOString().split('T')[0],
        streams: [{ url: stream.url, title: stream.name, behaviorHints: { bingeGroup: 'm3u_playlist' } }]
      }))
    }
  });
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const media = loadMedia();
  if (!media.m3uUrl) {
    return res.json({ streams: [] });
  }
  const streamId = req.params.id;
  const streams = await parseM3U(media.m3uUrl);
  const streamIndex = parseInt(streamId.replace('m3u_stream_', ''), 10);
  if (streamIndex >= 0 && streamIndex < streams.length) {
    const stream = streams[streamIndex];
    res.json({
      streams: [{
        title: stream.name,
        url: stream.url,
        behaviorHints: { bingeGroup: 'm3u_playlist' }
      }]
    });
  } else {
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => {
  console.log(`✅ M3UPLAYER running on http://localhost:${PORT}`);
});