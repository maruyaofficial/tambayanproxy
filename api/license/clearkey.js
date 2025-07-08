configureDRM() {
  const drm = this.currentChannel.drm;
  const type = drm?.type;

  if (type === 'clearkey') {
    this.player.configure({
      drm: {
        clearKeys: {
          [drm.keyId]: drm.key
        },
        // Optional: license server (not needed for inlined keys)
        // servers: {
        //   'org.w3.clearkey': 'https://yourserver/api/license/clearkey'
        // }
      }
    });
    this.lastDrmType = 'clearkey';
  }

  else if (type === 'widevine') {
    this.player.configure({
      drm: {
        servers: {
          'com.widevine.alpha': 'https://convrgkey.nathcreqtives.com/widevine/?deviceId=02:00:00:00:00:00'
        }
      }
    });
    this.lastDrmType = 'widevine';
  }

  else {
    // Clear any previous DRM config
    this.player.configure({
      drm: {
        servers: {},
        clearKeys: {},
        advanced: {}
      }
    });
    this.lastDrmType = 'none';
  }
}
