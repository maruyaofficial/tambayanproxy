const CONVRG_MANIFEST_BASE = 'https://proxy.tambayan-chat.site/001/2/';
const CONVRG_MANIFEST_SUFFIX = '/manifest.mpd?virtualDomain=001.live_hls.zte.com&IASHttpSessionId=OTT';
const CONVRG_LICENSE_URI = 'https://convrgkey.nathcreqtives.com/widevine/?deviceId=02:00:00:00:00:00';

function generateChannelId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').substring(0, 20) || `ch${Date.now().toString(36)}`;
}

const defaultChannelList = [
  {
    name: "ANIMAX",
    manifest: 'https://proxy.tambayan-chat.site/api/proxy?url=https://tglmp01.akamaized.net/out/v1/de55fad9216e4fe7ad8d2eed456ba1ec/manifest.mpd',
    drm: {
      type: 'clearkey',
      keyId: '92032b0e41a543fb9830751273b8debd',
      key: '03f8b65e2af785b10d6634735dbe6c11'
    },
    format: "dash"
  },
  {
    name: "CINEMO",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-cinemo-dash-abscbnono/f1da36ea-047e-4262-9e45-9326d0e2930b/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "Cinema One",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-cinemaone-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "Kapamilya HD",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-kapcha-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "TV5",
    manifest: 'http://reusora.org/mpd/TV5.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "MaruyaChannel",
    manifest: 'http://reusora.org/mpd/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "ANC",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-anc-global-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "GMA Pinoy TV",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-uw2-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-abscbn-gma-x7-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "Myx",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-myxnola-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "Teleradyo Serbisyo",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-teleradyo-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  {
    name: "TFC",
    manifest: 'https://officialmaruya.vercel.app/api/proxy?url=https://cdn-ue1-prod.tsv2.amagi.tv/linear/amg01006-abs-cbn-tfcasia-dash-abscbnono/index.mpd',
    drm: null,
    format: "dash"
  },
  // HLS Channels — sample group
  {
    name: "Arirang",
    manifest: 'https://cdn4.skygo.mn/live/disk1/Arirang/HLSv3-FTA/Arirang.m3u8',
    drm: null,
    format: "hls"
  },
  {
    name: "BBC Earth",
    manifest: 'https://cdn4.skygo.mn/live/disk1/BBC_earth/HLSv3-FTA/BBC_earth.m3u8',
    drm: null,
    format: "hls"
  },
  {
    name: "BBC Lifestyle",
    manifest: 'https://cdn4.skygo.mn/live/disk1/BBC_lifestyle/HLSv3-FTA/BBC_lifestyle.m3u8',
    drm: null,
    format: "hls"
  },
  {
    name: "BBC News",
    manifest: 'https://cdn4.skygo.mn/live/disk1/BBC_News/HLSv3-FTA/BBC_News.m3u8',
    drm: null,
    format: "hls"
  },
  {
    name: "Boomerang",
    manifest: 'https://cdn4.skygo.mn/live/disk1/Boomerang/HLSv3-FTA/Boomerang.m3u8',
    drm: null,
    format: "hls"
  }
  // Add more...
].map(channel => {
  // Ensure name exists
  if (!channel.name || channel.name.trim() === "") {
    channel.name = "Unnamed Channel";
  }

  // Ensure ID
  if (!channel.id) {
    channel.id = generateChannelId(channel.name);
  }

  // Fix malformed PLDT URLs
  if (channel.manifest?.includes('qp-pldt-live-grp')) {
    try {
      const url = new URL(channel.manifest);
      const match = url.hostname.match(/grp-\d+/);
      if (match) {
        const groupName = match[0];
        const manifestName = url.pathname.split('/').pop();
        channel.manifest = `https://proxy.tambayan-chat.site/api/akamai/${groupName}/${manifestName}`;
      }
    } catch (e) {
      console.warn("Failed to parse PLDT manifest:", channel.manifest, e);
    }
  }

  // Defaults
  if (!channel.drm) channel.drm = null;
  if (!channel.image) channel.image = null;
  if (!channel.format) channel.format = "auto";

  return channel;
});

export { defaultChannelList, generateChannelId };
