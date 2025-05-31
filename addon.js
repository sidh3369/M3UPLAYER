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
    const response = await axios.get(url);
    const lines = response.data.split('\n');
    const streams = [];
    let name = '';
    for (const line of lines) {
      if (line.startsWith('#EXTINF:')) {
        const match = line.match(/,(.+)/);
        name = match ? match[1].trim() : 'Stream';
      } else if (line && !line.startsWith('#')) {
        streams.push({ name, url: line.trim() });
        name = '';
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

app.post('/set-m3u', (req, res) => {
  const { m3uUrl } = req.body;
  if (!m3uUrl) return res.json({ success: false, error: 'M3U URL required' });
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
  if (!media.m3uUrl) return res.json({ streams: [] });
  const streams = await parseM3U(media.m3uUrl);
  const streamIndex = parseInt(req.params.id.replace('m3u_stream_', ''), 10);
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
    res.json({
      streams: streams.map((stream, index) => ({
        title: stream.name,
        url: stream.url,
        externalUrl: `stremio:///detail/movie/m3u_playlist/m3u_stream_${index}`,
        behaviorHints: { bingeGroup: 'm3u_playlist' }
      }))
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ SimpleM3U running on http://localhost:${PORT}`);
});
