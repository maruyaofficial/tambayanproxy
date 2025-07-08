// Channel Player Application
class ChannelPlayer {
    constructor() {
        this.channels = [];
        this.currentChannelIndex = 0;
        this.currentChannel = null;
        this.filteredChannels = [];
        this.player = null;
        this.isChangingChannel = false;
        this.channelChangeTimeout = null;
        this.controlsHideTimeout = null;
        this.controlsVisible = false;
        this.lastDrmType = null; // Track previous DRM type for smart switching
        
        // Channel number input
        this.channelNumberInput = '';
        this.channelNumberTimeout = null;
        
        // DOM elements
        this.elements = {
            video: document.getElementById('videoPlayer'),
            channelsList: document.getElementById('channelsList'),
            channelSearch: document.getElementById('channelSearch'),
            loadingSpinner: document.getElementById('loadingSpinner'),
            errorNotification: document.getElementById('errorNotification'),
            errorText: document.getElementById('errorText'),
            sidebar: document.getElementById('channelSidebar'),
            fullscreenBtn: document.getElementById('fullscreenBtn'),
            channelNamePopup: document.getElementById('channelNamePopup'),
            currentChannelName: document.getElementById('currentChannelName'),
            currentChannelInfo: document.getElementById('currentChannelInfo'),
            menuToggleBtn: document.getElementById('menuToggleBtn'),
            sidebarClose: document.getElementById('sidebarClose'),
            unmuteOverlay: document.getElementById('unmuteOverlay'),
            qualityBtn: document.getElementById('qualityBtn'),
            qualityDropdown: document.getElementById('qualityDropdown'),
            currentQuality: document.getElementById('currentQuality'),
            drmType: document.getElementById('drmType'),
            manifestUrl: document.getElementById('manifestUrl'),
            playbackStatus: document.getElementById('playbackStatus'),
            healthCheckBtn: document.getElementById('healthCheckBtn'),
            infoToggleBtn: document.getElementById('infoToggleBtn'),
            channelInfoPanel: document.getElementById('channelInfoPanel'),
            channelNumberDisplay: document.getElementById('channelNumberDisplay')
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Install Shaka Player polyfills
            shaka.polyfill.installAll();
            
            // Check for browser support
            if (!shaka.Player.isBrowserSupported()) {
                this.showError('Your browser does not support the required video features.');
                return;
            }
            
            // Initialize Shaka Player
            this.player = new shaka.Player(this.elements.video);
            this.setupShakaEventListeners();
            this.configureBuffering();
            
            // Load channels from the module
            const channelsModule = await import('./channels.js');
            this.channels = channelsModule.defaultChannelList || [];
            
            // Sort channels alphabetically
            this.channels.sort((a, b) => a.name.localeCompare(b.name));
            this.filteredChannels = [...this.channels];
            
            // Initialize channel status tracking
            this.channelStatus = new Map();
            
            this.setupEventListeners();
            this.renderChannels();
            this.checkEMESupport();
            this.checkHlsSupport();
            
                        // Ensure video starts muted
            this.elements.video.muted = true;
            
            // Check for URL hash routing or auto-select first channel
            this.handleInitialRouting();

            console.log(`Loaded ${this.channels.length} channels`);
            
            // Start background health check after initial load (optional)
            // Only run if explicitly enabled or in development
            if (localStorage.getItem('enableHealthCheck') === 'true' || 
                window.location.hostname === 'localhost' || 
                window.location.hostname === '127.0.0.1') {
                setTimeout(() => {
                    this.performChannelHealthCheck();
                }, 5000);
            }
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError('Failed to load channels. Please refresh the page.');
        }
    }
    
    setupShakaEventListeners() {
        // Listen for errors
        this.player.addEventListener('error', (event) => {
            this.handleShakaError(event.detail);
        });
        
        // Listen for streaming events
        this.player.addEventListener('streaming', (event) => {
            console.log('Streaming event:', event.type);
        });
    }
    
    configureBuffering() {
        // Configure conservative buffering for MP4 segment compatibility
        this.player.configure({
            streaming: {
                // Conservative buffer settings for better MP4 compatibility
                rebufferingGoal: 10,          // Smaller buffer to reduce MP4 parsing issues
                bufferingGoal: 20,           // Conservative buffer ahead
                bufferBehind: 20,            // Smaller buffer behind
                
                // Conservative segment prefetch to avoid overwhelming MP4 parser
                segmentPrefetchLimit: 2,      // Reduced prefetch for MP4 compatibility
                
                // Conservative retry settings
                retryParameters: {
                    timeout: 30000,          // Longer timeout for MP4 segments
                    maxAttempts: 3,          // Fewer attempts to avoid parser issues
                    baseDelay: 1000,         // Longer delay between retries
                    backoffFactor: 2,        // Standard backoff
                    fuzzFactor: 0.5          // Standard randomness
                },
                
                // Conservative manifest polling
                updateIntervalSeconds: 2,     // Less frequent polling
                
                // Conservative failure handling
                maxDisabledTime: 60000,       // Longer re-enable time
                
                // Minimal seek handling to avoid MP4 parser conflicts
                safeSeekOffset: 3,           // Smaller seek offset
                stallEnabled: false,         // Disable stall detection for now
                stallThreshold: 3,           // Higher threshold if enabled
                stallSkip: 0.5              // Larger skip if needed
            },
            
            // Conservative ABR settings
            abr: {
                enabled: true,
                useNetworkInformation: false,         // Disable network info for compatibility
                defaultBandwidthEstimate: 5000000,    // Lower initial estimate (5 Mbps)
                switchInterval: 5,                    // Slower switches to reduce parser stress
                bandwidthUpgradeTarget: 0.8,         // Higher threshold for upgrades
                bandwidthDowngradeTarget: 0.95,      // Higher threshold for downgrades
                restrictions: {
                    minBandwidth: 500000,             // Higher minimum bandwidth
                    maxBandwidth: Infinity,
                    minHeight: 240,                   // Higher minimum resolution
                    maxHeight: Infinity,
                    minWidth: 320,                    // Higher minimum width
                    maxWidth: Infinity
                }
            },
            
            // Conservative manifest settings
            manifest: {
                retryParameters: {
                    timeout: 30000,          // Longer manifest timeout
                    maxAttempts: 3,          // Fewer manifest retries
                    baseDelay: 1000,         // Standard delay
                    backoffFactor: 2,        // Standard backoff
                    fuzzFactor: 0.5
                }
            }
        });
        
        console.log('Configured conservative buffering for MP4 segment compatibility');
    }
    
    handleShakaError(error) {
        console.error('Shaka Player error:', error);
        console.error('Error details:', {
            code: error.code,
            category: error.category,
            data: error.data
        });
        
        // Ignore certain errors that are expected during channel switching
        if (error.code === 7000) { // LOAD_INTERRUPTED
            console.log('Load interrupted during channel switch - this is expected behavior');
            return;
        }
        
        if (error.code === 1002 || // HTTP errors during unload
            error.code === 3016 || // Operation aborted
            error.category === 7) { // Network category errors during switching
            console.log('Ignoring expected error during channel operation:', error.code);
            return;
        }
        
        // Handle DRM switching error 4032 specifically
        if (error.code === 4032) {
            console.warn('DRM configuration error detected (Error 4032) - attempting recovery...');
            // Trigger a channel retry after a brief delay to allow for proper cleanup
            setTimeout(() => {
                if (this.currentChannel) {
                    console.log('Retrying channel after DRM error...');
                    this.playCurrentChannel();
                }
            }, 500);
            return;
        }
        
        let message = 'Playback error occurred';
        
        if (error.code) {
            switch (error.code) {
                case shaka.util.Error.Code.HTTP_ERROR:
                    message = `Network error: Unable to load content (${error.data?.[1] || 'Unknown status'})`;
                    break;
                case shaka.util.Error.Code.UNABLE_TO_GUESS_MANIFEST_TYPE:
                    message = 'Invalid manifest format';
                    break;
                case shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE:
                    message = 'DRM system not available';
                    break;
                case shaka.util.Error.Code.LICENSE_REQUEST_FAILED:
                    message = 'DRM license request failed';
                    break;
                case shaka.util.Error.Code.BAD_HTTP_STATUS:
                    message = `HTTP error: ${error.data?.[1] || 'Bad status'} - ${error.data?.[0] || 'Unknown URL'}`;
                    break;
                default:
                    message = `Playback error: ${error.message || 'Unknown error'} (Code: ${error.code})`;
            }
        }
        
        this.showError(message);
        this.updateStatus('Error', 'danger');
    }
    
    checkEMESupport() {
        if (!navigator.requestMediaKeySystemAccess) {
            this.showError('Your browser does not support Encrypted Media Extensions (EME).');
            return false;
        }
        console.log('EME support detected');
        return true;
    }
    
    checkHlsSupport() {
        const hlsAvailable = typeof Hls !== 'undefined';
        const hlsSupported = hlsAvailable && Hls.isSupported();
        
        console.log('HLS.js Support Check:', {
            hlsAvailable,
            hlsSupported,
            hlsVersion: hlsAvailable ? Hls.version : 'N/A'
        });
        
        if (!hlsAvailable) {
            console.warn('HLS.js is not loaded - M3U8 streams will use Shaka Player fallback');
        } else if (!hlsSupported) {
            console.warn('HLS.js is loaded but not supported in this browser');
        } else {
            console.log('HLS.js is ready for M3U8 streams');
        }
        
        return hlsSupported;
    }
    
    generateHashtag(channelName) {
        // Remove special characters and spaces, convert to lowercase
        const cleanName = channelName
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
            .replace(/\s+/g, '') // Remove all spaces
            .replace(/hd$/i, '') // Remove "HD" suffix if present
            .replace(/tv$/i, '') // Remove "TV" suffix if present
            .substring(0, 15); // Limit length
        
        return `#${cleanName}`;
    }
    
    setupEventListeners() {
        // Keyboard navigation
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Mouse wheel navigation for channel changing
        this.elements.video.addEventListener('wheel', (e) => this.handleScroll(e));
        
        // Video container mouse activity for auto-hiding controls
        const videoContainer = document.querySelector('.video-container');
        videoContainer.addEventListener('mouseenter', () => this.showVideoControls());
        videoContainer.addEventListener('mousemove', () => this.showVideoControls());
        videoContainer.addEventListener('mouseleave', () => this.hideVideoControls());
        
        // Click anywhere on video container to unmute
        videoContainer.addEventListener('click', (e) => {
            // Only unmute if video is muted and playing
            if (this.elements.video.muted && !this.elements.video.paused) {
                // Prevent click from triggering other controls but allow unmuting
                e.stopPropagation();
                this.elements.video.muted = false;
                this.updateUnmuteOverlay();
            }
        });
        
        // Search functionality
        this.elements.channelSearch.addEventListener('input', (e) => {
            this.filterChannels(e.target.value);
        });
        
        // Remove sidebar toggle functionality (no toggle button in new design)
        
        // Fullscreen button
        this.elements.fullscreenBtn.addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // Menu toggle button
        this.elements.menuToggleBtn.addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // Sidebar close button (mobile)
        this.elements.sidebarClose.addEventListener('click', () => {
            this.hideSidebar();
        });
        
        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                this.elements.sidebar.classList.contains('show') &&
                !this.elements.sidebar.contains(e.target) &&
                !this.elements.menuToggleBtn.contains(e.target)) {
                this.hideSidebar();
            }
        });
        
        // Quality selector
        this.elements.qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleQualityDropdown();
        });
        
        // Close quality dropdown when clicking outside
        document.addEventListener('click', () => {
            this.elements.qualityDropdown.classList.remove('show');
        });
        
        // Health check button
        this.elements.healthCheckBtn.addEventListener('click', () => {
            this.triggerManualHealthCheck();
        });
        
        // Info toggle button
        this.elements.infoToggleBtn.addEventListener('click', () => {
            this.toggleChannelInfoPanel();
        });
        
        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        
        // Video events
        this.elements.video.addEventListener('loadstart', () => this.updateStatus('Loading...', 'warning'));
        this.elements.video.addEventListener('canplay', () => this.updateStatus('Ready', 'success'));
        this.elements.video.addEventListener('playing', () => {
            this.updateStatus('Playing', 'success');
            this.updateUnmuteOverlay();
            this.startAutoHideChecking(); // Start auto-hide when playing
        });
        this.elements.video.addEventListener('pause', () => {
            this.updateStatus('Paused', 'secondary');
            this.stopAutoHideChecking(); // Stop auto-hide when paused
        });
        this.elements.video.addEventListener('error', (e) => this.handleVideoError(e));
        this.elements.video.addEventListener('volumechange', () => this.updateUnmuteOverlay());
        
        // Mouse events for sidebar auto-hide
        this.sidebarTimer = null;
        this.lastActivity = Date.now();
        this.autoHideInterval = null;
        
        this.resetSidebarTimer = () => {
            // Only auto-hide on desktop
            if (window.innerWidth <= 768) return;
            
            clearTimeout(this.sidebarTimer);
            this.sidebarTimer = setTimeout(() => {
                // Only auto-hide if video is playing and on desktop
                if (!this.elements.video.paused && window.innerWidth > 768 && 
                    Date.now() - this.lastActivity > 3000) {
                    this.hideSidebar();
                }
            }, 3000);
        };

        // Start auto-hide checking when video starts playing
        this.startAutoHideChecking = () => {
            if (this.autoHideInterval) {
                clearInterval(this.autoHideInterval);
            }
            
            this.autoHideInterval = setInterval(() => {
                // Only auto-hide on desktop when video is playing
                if (window.innerWidth > 768 && 
                    !this.elements.video.paused && 
                    Date.now() - this.lastActivity > 3000) {
                    this.hideSidebar();
                }
            }, 1000); // Check every second
        };

        // Stop auto-hide checking when video stops
        this.stopAutoHideChecking = () => {
            if (this.autoHideInterval) {
                clearInterval(this.autoHideInterval);
                this.autoHideInterval = null;
            }
        };
        
        document.addEventListener('mousemove', (e) => {
            // Only enable auto-show/hide on desktop
            if (window.innerWidth <= 768) return;
            
            this.lastActivity = Date.now();
            if (e.clientX < 100) {
                this.elements.menuToggleBtn.classList.add('show');
                if (e.clientX < 50) {
                    this.showSidebar();
                }
            } else {
                this.elements.menuToggleBtn.classList.remove('show');
            }
        });
        
        // Show sidebar on any keyboard activity (desktop only)
        document.addEventListener('keydown', () => {
            if (window.innerWidth <= 768) return;
            
            this.lastActivity = Date.now();
            this.showSidebar();
        });

        // Hash change event for direct channel URLs
        window.addEventListener('hashchange', () => {
            this.handleHashChange();
        });
    }
    
    handleKeyboard(e) {
        // Show video controls on any keyboard activity
        this.showVideoControls();
        
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                this.navigateChannel(-1);
                this.showSidebar();
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.navigateChannel(1);
                this.showSidebar();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentChannel) {
                    this.playCurrentChannel();
                }
                break;
            case ' ':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'q':
            case 'Q':
                e.preventDefault();
                this.toggleQualityDropdown();
                break;
            case 'i':
            case 'I':
                e.preventDefault();
                this.toggleChannelInfoPanel();
                break;
            default:
                // Handle number keys for channel switching
                if (e.key >= '0' && e.key <= '9') {
                    e.preventDefault();
                    this.handleChannelNumberInput(e.key);
                }
                break;
        }
    }
    
    handleScroll(e) {
        // Prevent default scrolling behavior
        e.preventDefault();
        
        // Determine scroll direction
        const direction = e.deltaY > 0 ? 1 : -1;
        
        // Navigate channels based on scroll direction
        this.navigateChannel(direction);
        
        // Show sidebar when scrolling to change channels (desktop only)
        if (window.innerWidth > 768) {
            this.lastActivity = Date.now();
            this.showSidebar();
            this.resetSidebarTimer();
        }
    }
    
    filterChannels(searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        this.filteredChannels = this.channels.filter(channel =>
            channel.name.toLowerCase().includes(term)
        );
        
        // Maintain alphabetical order in filtered results
        this.filteredChannels.sort((a, b) => a.name.localeCompare(b.name));
        
        this.renderChannels();
        
        if (this.filteredChannels.length > 0) {
            this.currentChannelIndex = 0;
            this.highlightCurrentChannel();
        }
    }
    
    renderChannels() {
        this.elements.channelsList.innerHTML = '';
        
        this.filteredChannels.forEach((channel, index) => {
            const channelElement = this.createChannelElement(channel, index);
            this.elements.channelsList.appendChild(channelElement);
        });
    }
    
    createChannelElement(channel, index) {
        const div = document.createElement('div');
        div.className = 'channel-item fade-in';
        div.setAttribute('data-index', index);
        
        // Add channel number
        const channelNumber = document.createElement('div');
        channelNumber.className = 'channel-number';
        channelNumber.textContent = (index + 1).toString();
        
        const detailsElement = this.createChannelDetails(channel, index + 1);
        
        div.appendChild(channelNumber);
        div.appendChild(detailsElement);
        
        div.addEventListener('click', () => {
            this.selectChannel(index);
            this.playCurrentChannel();
        });
        
        return div;
    }
    

    
    createChannelDetails(channel, channelNumber) {
        const details = document.createElement('div');
        details.className = 'channel-details';
        
        const nameContainer = document.createElement('div');
        nameContainer.className = 'channel-name-container';
        
        const name = document.createElement('h6');
        name.textContent = channel.name;
        
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'channel-status-indicator';
        statusIndicator.setAttribute('data-channel-id', channel.id || channel.name);
        
        const status = this.channelStatus.get(channel.id || channel.name);
        if (status === 'error') {
            statusIndicator.classList.add('error');
            statusIndicator.title = 'Channel not playable';
        } else if (status === 'ok') {
            statusIndicator.classList.add('ok');
            statusIndicator.title = 'Channel working';
        } else {
            statusIndicator.classList.add('unknown');
            statusIndicator.title = 'Status unknown';
        }
        
        nameContainer.appendChild(name);
        nameContainer.appendChild(statusIndicator);
        
        const meta = document.createElement('div');
        meta.className = 'channel-meta';
        
        const drmBadge = document.createElement('span');
        drmBadge.className = `drm-badge drm-${channel.drm?.type || 'none'}`;
        drmBadge.textContent = channel.drm?.type?.toUpperCase() || 'No DRM';
        
        const hashtag = document.createElement('span');
        hashtag.className = 'channel-hashtag';
        hashtag.textContent = this.generateHashtag(channel.name);
        
        meta.appendChild(drmBadge);
        meta.appendChild(hashtag);
        details.appendChild(nameContainer);
        details.appendChild(meta);
        
        return details;
    }
    
    navigateChannel(direction) {
        if (this.filteredChannels.length === 0) return;
        
        this.currentChannelIndex += direction;
        
        if (this.currentChannelIndex < 0) {
            this.currentChannelIndex = this.filteredChannels.length - 1;
        } else if (this.currentChannelIndex >= this.filteredChannels.length) {
            this.currentChannelIndex = 0;
        }
        
        this.selectChannel(this.currentChannelIndex);
    }
    
    selectChannel(index) {
        if (index < 0 || index >= this.filteredChannels.length) return;
        
        // Prevent rapid channel switching
        if (this.isChangingChannel) {
            clearTimeout(this.channelChangeTimeout);
        }
        
        this.currentChannelIndex = index;
        this.currentChannel = this.filteredChannels[index];
        
        this.highlightCurrentChannel();
        this.updateChannelInfo();
        this.updateUrlHash(); // Update URL hash when channel changes
        
        // Debounce channel changes to prevent rapid switching (reduced timeout)
        this.isChangingChannel = true;
        this.channelChangeTimeout = setTimeout(() => {
            this.playCurrentChannel();
            this.isChangingChannel = false;
        }, 500); // Reduced from 1000ms to 500ms for better responsiveness
    }
    
    highlightCurrentChannel() {
        // Remove active class from all channel items
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find the current element by data-index
        const currentElement = document.querySelector(`[data-index="${this.currentChannelIndex}"]`);
        if (currentElement) {
            currentElement.classList.add('active');
            
            // Get the scrollable container (channels list)
            const channelsList = this.elements.channelsList;
            
            // Ensure smooth scrolling with better positioning
            setTimeout(() => {
                // First try scrollIntoView on the element
                currentElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center',
                    inline: 'nearest' 
                });
                
                // Alternative manual scroll calculation if needed
                const containerRect = channelsList.getBoundingClientRect();
                const elementRect = currentElement.getBoundingClientRect();
                
                // Check if element is fully visible
                const isElementVisible = (
                    elementRect.top >= containerRect.top &&
                    elementRect.bottom <= containerRect.bottom
                );
                
                // If not visible, force scroll to center
                if (!isElementVisible) {
                    const elementTop = currentElement.offsetTop;
                    const elementHeight = currentElement.offsetHeight;
                    const containerHeight = channelsList.clientHeight;
                    const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
                    
                    channelsList.scrollTo({
                        top: Math.max(0, scrollTop),
                        behavior: 'smooth'
                    });
                }
            }, 50); // Slightly longer delay for better reliability
        } else {
            // Fallback: if element not found, log for debugging
            console.warn(`Channel element not found for index: ${this.currentChannelIndex}`, {
                totalFiltered: this.filteredChannels.length,
                currentIndex: this.currentChannelIndex
            });
        }
    }
    
    updateChannelInfo() {
        if (!this.currentChannel) return;
        
        this.elements.currentChannelName.textContent = this.currentChannel.name;
        this.elements.currentChannelInfo.textContent = `Channel ${this.currentChannelIndex + 1} of ${this.filteredChannels.length}`;
        this.elements.drmType.textContent = this.currentChannel.drm?.type?.toUpperCase() || 'None';
        this.elements.manifestUrl.textContent = this.currentChannel.manifest;
        
        document.title = `${this.currentChannelIndex + 1}. ${this.currentChannel.name} - Channel Player`;
        
        // Show channel popup when channel changes
        this.showChannelPopup();
    }
    
        async playCurrentChannel() {
        if (!this.currentChannel) return;

        try {
            this.showLoading();
            this.hideError();
            
            // Cancel any pending channel change timeouts
            if (this.channelChangeTimeout) {
                clearTimeout(this.channelChangeTimeout);
            }
            
            // Detect if this is an HLS stream and use HLS.js instead of Shaka
            const isM3U8 = this.currentChannel.manifest.toLowerCase().includes('.m3u8');
            const hlsAvailable = typeof Hls !== 'undefined';
            const hlsSupported = hlsAvailable && Hls.isSupported();
            
            console.log('Stream detection:', {
                isM3U8,
                hlsAvailable,
                hlsSupported,
                manifest: this.currentChannel.manifest
            });
            
            if (isM3U8 && hlsSupported) {
                console.log('Using HLS.js for M3U8 stream');
                await this.playWithHlsJs();
                return;
            } else if (isM3U8 && !hlsSupported) {
                console.warn('M3U8 detected but HLS.js not available, falling back to Shaka Player');
            }
            
            // Ensure we have a Shaka Player instance (recreate if coming from HLS.js)
            if (!this.player) {
                console.log('Creating Shaka Player instance (switching from HLS.js or initial load)...');
                // Destroy HLS.js player if it exists
                if (this.hlsPlayer) {
                    this.hlsPlayer.destroy();
                    this.hlsPlayer = null;
                }
                
                // Create fresh Shaka Player instance
                this.player = new shaka.Player(this.elements.video);
                this.setupShakaEventListeners();
                this.configureBuffering();
                console.log('Shaka Player created');
                
                // Brief pause after creation
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            // Check if we need to recreate player due to DRM type change
            const needsPlayerRecreation = this.shouldRecreatePlayer();
            
            if (needsPlayerRecreation) {
                console.log('Recreating player due to DRM type change...');
                if (this.player) {
                    try {
                        await this.player.destroy();
                    } catch (destroyError) {
                        console.warn('Error destroying player:', destroyError);
                    }
                }
                
                // Recreate fresh player instance
                this.player = new shaka.Player(this.elements.video);
                this.setupShakaEventListeners();
                this.configureBuffering();
                console.log('Player recreated for DRM switching');
                
                // Longer pause after recreation
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                // Normal unload for same DRM type
                if (this.player && this.player.getLoadMode() !== shaka.Player.LoadMode.NOT_LOADED) {
                    try {
                        console.log('Unloading current stream...');
                        await this.player.unload();
                    } catch (unloadError) {
                        console.warn('Error during player unload (continuing anyway):', unloadError);
                        // If unload fails, recreate the player as fallback
                        try {
                            await this.player.destroy();
                            this.player = new shaka.Player(this.elements.video);
                            this.setupShakaEventListeners();
                            this.configureBuffering();
                        } catch (recreateError) {
                            console.error('Failed to recreate player:', recreateError);
                        }
                    }
                }
                
                // Standard pause for same DRM type
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            console.log(`Playing: ${this.currentChannel.name}`);
            console.log(`Manifest: ${this.currentChannel.manifest}`);
            console.log(`DRM: ${JSON.stringify(this.currentChannel.drm)}`);
            
            // Ensure video element is visible and force repaint
            this.elements.video.style.display = 'block';
            this.elements.video.style.visibility = 'visible';
            this.elements.video.style.opacity = '1';
            
            // Force browser repaint to fix rendering issues
            this.elements.video.offsetHeight;
            
            // Configure DRM if needed
            if (this.currentChannel.drm && this.currentChannel.drm.type !== 'none') {
                this.configureDRM();
                // Additional pause after DRM configuration to let it settle
                await new Promise(resolve => setTimeout(resolve, 100));
            } else {
                // Clear any existing DRM configuration
                this.player.configure({
                    drm: {
                        servers: {},
                        clearKeys: {},
                        advanced: {}
                    }
                });
                // Update last DRM type to none
                this.lastDrmType = 'none';
            }
            
            // Load the manifest
            await this.player.load(this.currentChannel.manifest);
            
            // Wait for initial buffer to build up (reduces perceived loading time)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Populate quality options after manifest is loaded
            setTimeout(() => {
                this.populateQualityOptions();
            }, 1000);
            
            // Start playback
            await this.elements.video.play();
            
            // Start auto-hide checking once video starts playing
            this.startAutoHideChecking();
            
            // Show video controls initially when video starts
            this.showVideoControls();
            
            // Force another repaint after playback starts
            this.elements.video.offsetHeight;
            this.elements.video.style.transform = 'translateZ(0)';
            
            // Update unmute overlay
            this.updateUnmuteOverlay();
            
            // Mark channel as working
            this.updateChannelStatus(this.currentChannel.id || this.currentChannel.name, 'ok');
            
            console.log('Video playback started successfully');
            
        } catch (error) {
            console.error('Playback error:', error);
            
            // Provide more user-friendly error messages
            let errorMessage = `Failed to play ${this.currentChannel.name}`;
            
            if (error.code === 7000) {
                // Shaka Error 7000 - Load interrupted, usually during rapid channel switching
                console.warn('Load interrupted - this can happen during rapid channel switching');
                return; // Don't show error for interrupted loads as they're expected
            } else if (error.code === 7002) {
                errorMessage = `${this.currentChannel.name} is currently unavailable. The stream may be offline or the key may have expired.`;
            } else if (error.message && (error.message.includes('network') || error.message.includes('HTTP'))) {
                errorMessage = `${this.currentChannel.name} is not accessible. Please check your connection or try again later.`;
            } else if (error.message) {
                errorMessage = `${this.currentChannel.name}: ${error.message}`;
            }
            
            this.showError(errorMessage);
            
            // Mark channel as not working
            this.updateChannelStatus(this.currentChannel.id || this.currentChannel.name, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    async playWithHlsJs() {
        console.log(`Playing HLS stream with HLS.js: ${this.currentChannel.name}`);
        console.log(`Manifest: ${this.currentChannel.manifest}`);
        
        try {
            // Destroy existing Shaka Player if it exists
            if (this.player) {
                try {
                    await this.player.destroy();
                } catch (destroyError) {
                    console.warn('Error destroying Shaka player:', destroyError);
                }
                this.player = null;
            }
            
            // Destroy existing HLS.js instance if it exists
            if (this.hlsPlayer) {
                this.hlsPlayer.destroy();
                this.hlsPlayer = null;
            }
            
            // Create new HLS.js instance
            this.hlsPlayer = new Hls({
                // Configure HLS.js for better MP4 segment handling
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 20,
                maxBufferLength: 25,
                maxMaxBufferLength: 30,
                maxBufferSize: 60 * 1000 * 1000, // 60MB
                maxBufferHole: 0.5,
                
                // Fragment loading settings
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 3,
                fragLoadingRetryDelay: 1000,
                fragLoadingMaxRetryTimeout: 64000,
                
                // Manifest loading settings
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 3,
                manifestLoadingRetryDelay: 500,
                manifestLoadingMaxRetryTimeout: 8000
            });
            
            // Set up HLS.js event listeners
            this.hlsPlayer.on(Hls.Events.MEDIA_ATTACHED, () => {
                console.log('HLS.js: Video element attached');
            });
            
            this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS.js: Manifest parsed successfully');
                this.elements.video.play().catch(e => console.warn('Auto-play failed:', e));
            });
            
            this.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
                console.error('HLS.js error:', data);
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.log('Trying to recover from network error...');
                            this.hlsPlayer.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.log('Trying to recover from media error...');
                            this.hlsPlayer.recoverMediaError();
                            break;
                        default:
                            this.showError(`HLS playback failed: ${data.reason || 'Unknown error'}`);
                            break;
                    }
                }
            });
            
            this.hlsPlayer.on(Hls.Events.FRAG_LOADED, (event, data) => {
                // Log successful fragment loading for debugging
                if (data.frag.url.includes('.mp4')) {
                    console.log('HLS.js: Successfully loaded MP4 fragment');
                }
            });
            
            // Attach to video element
            this.hlsPlayer.attachMedia(this.elements.video);
            
            // Load the manifest
            this.hlsPlayer.loadSource(this.currentChannel.manifest);
            
            // Update status
            this.updateStatus('Loading HLS...', 'warning');
            
            // Mark channel as working
            this.updateChannelStatus(this.currentChannel.id || this.currentChannel.name, 'ok');
            
            console.log('HLS.js player initialized successfully');
            
        } catch (error) {
            console.error('HLS.js playback error:', error);
            this.showError(`Failed to play ${this.currentChannel.name} with HLS.js: ${error.message}`);
            this.updateChannelStatus(this.currentChannel.id || this.currentChannel.name, 'error');
        } finally {
            this.hideLoading();
        }
    }
    
    shouldRecreatePlayer() {
        if (!this.currentChannel || !this.currentChannel.drm) {
            return false;
        }
        
        const currentDrmType = this.currentChannel.drm.type || 'none';
        const lastDrmType = this.lastDrmType || 'none';
        
        // Recreate player if switching between different DRM types
        const needsRecreation = currentDrmType !== lastDrmType && 
                               (currentDrmType === 'clearkey' || currentDrmType === 'widevine' || 
                                lastDrmType === 'clearkey' || lastDrmType === 'widevine');
        
        console.log(`DRM Type Check: ${lastDrmType} -> ${currentDrmType}, Needs recreation: ${needsRecreation}`);
        
        return needsRecreation;
    }
    
    configureDRM() {
        const { drm } = this.currentChannel;
        
        // Safety check - ensure player exists
        if (!this.player) {
            console.error('Cannot configure DRM: Shaka Player instance is null');
            throw new Error('Shaka Player not initialized for DRM configuration');
        }
        
        // Always clear previous DRM configuration first to prevent conflicts
        this.player.configure({
            drm: {
                servers: {},
                clearKeys: {},
                advanced: {}
            }
        });
        
        console.log('Cleared previous DRM configuration');
        
        if (drm.type === 'clearkey') {
            // Configure ClearKey DRM
            const clearKeys = {};
            clearKeys[drm.keyId] = drm.key;
            
            this.player.configure({
                drm: {
                    clearKeys: clearKeys,
                    servers: {},  // Explicitly clear servers
                    advanced: {}  // Clear advanced settings
                }
            });
            
            console.log('Configured ClearKey DRM');
            
        } else if (drm.type === 'widevine') {
            // Configure Widevine DRM
            this.player.configure({
                drm: {
                    servers: {
                        'com.widevine.alpha': drm.licenseUri
                    },
                    clearKeys: {},  // Explicitly clear clearKeys
                    advanced: {}    // Clear advanced settings
                }
            });
            
            console.log('Configured Widevine DRM');
            
        } else if (drm.type === 'playready') {
            // Configure PlayReady DRM
            this.player.configure({
                drm: {
                    servers: {
                        'com.microsoft.playready': drm.licenseUri
                    },
                    clearKeys: {},  // Explicitly clear clearKeys
                    advanced: {}    // Clear advanced settings
                }
            });
            
            console.log('Configured PlayReady DRM');
        }
        
        // Update the last DRM type for future comparisons
        this.lastDrmType = drm.type || 'none';
    }
    
    destroy() {
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }
        if (this.hlsPlayer) {
            this.hlsPlayer.destroy();
            this.hlsPlayer = null;
        }
    }
    
    handleVideoError(event) {
        const error = this.elements.video.error;
        let message = 'Video playback error';
        
        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_NETWORK:
                    message = 'Network error occurred';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    message = 'Video decoding error';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    message = 'Video format not supported';
                    break;
            }
        }
        
        this.showError(message);
        this.updateStatus('Error', 'danger');
    }
    
    togglePlayPause() {
        if (this.elements.video.paused) {
            this.elements.video.play();
        } else {
            this.elements.video.pause();
        }
    }
    
    toggleMute() {
        this.elements.video.muted = !this.elements.video.muted;
        this.updateUnmuteOverlay();
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.elements.video.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
    
    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement || 
                                document.webkitFullscreenElement || 
                                document.mozFullScreenElement);
        
        if (isFullscreen) {
            // Hide sidebar in fullscreen
            this.elements.sidebar.style.display = 'none';
            // Update fullscreen button icon
            this.elements.fullscreenBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
        } else {
            // Show sidebar when exiting fullscreen
            this.elements.sidebar.style.display = '';
            // Update fullscreen button icon
            this.elements.fullscreenBtn.innerHTML = '<i class="bi bi-fullscreen"></i>';
        }
    }
    
    toggleSidebar() {
        this.elements.sidebar.classList.toggle('show');
    }
    
        showSidebar() {
        this.elements.sidebar.classList.add('show');
        this.lastActivity = Date.now(); // Reset activity timer when showing sidebar
    }

    hideSidebar() {
        this.elements.sidebar.classList.remove('show');
    }

    showChannelPopup() {
        this.elements.channelNamePopup.classList.add('show');
        // Auto-hide after 3 seconds
        clearTimeout(this.channelPopupTimeout);
        this.channelPopupTimeout = setTimeout(() => {
            this.hideChannelPopup();
        }, 3000);
    }

    hideChannelPopup() {
        this.elements.channelNamePopup.classList.remove('show');
    }
    
    updateUnmuteOverlay() {
        const videoContainer = document.querySelector('.video-container');
        
        if (this.elements.video.muted && !this.elements.video.paused) {
            this.elements.unmuteOverlay.classList.add('show');
            videoContainer.classList.add('muted');
            // Temporarily disable video controls to prevent pause/play on click
            this.elements.video.removeAttribute('controls');
        } else {
            this.elements.unmuteOverlay.classList.remove('show');
            videoContainer.classList.remove('muted');
            // Re-enable video controls when not muted
            this.elements.video.setAttribute('controls', '');
        }
    }
    
    toggleQualityDropdown() {
        this.elements.qualityDropdown.classList.toggle('show');
    }
    
    toggleChannelInfoPanel() {
        this.elements.channelInfoPanel.classList.toggle('hidden');
    }
    
    populateQualityOptions() {
        if (!this.player) return;
        
        const tracks = this.player.getVariantTracks();
        const dropdown = this.elements.qualityDropdown;
        
        // Clear existing options
        dropdown.innerHTML = '';
        
        // Add Auto option
        const autoItem = document.createElement('div');
        autoItem.className = 'quality-item active';
        autoItem.setAttribute('data-quality', 'auto');
        autoItem.innerHTML = `
            <span>Auto</span>
            <small>Adaptive</small>
        `;
        autoItem.addEventListener('click', () => this.setQuality('auto'));
        dropdown.appendChild(autoItem);
        
        // Group tracks by height and get unique resolutions
        const qualityMap = new Map();
        tracks.forEach(track => {
            if (track.height) {
                const key = `${track.height}p`;
                if (!qualityMap.has(key)) {
                    qualityMap.set(key, {
                        height: track.height,
                        bandwidth: track.bandwidth,
                        tracks: [track]
                    });
                } else {
                    qualityMap.get(key).tracks.push(track);
                }
            }
        });
        
        // Sort by quality (highest first)
        const sortedQualities = Array.from(qualityMap.entries())
            .sort((a, b) => b[1].height - a[1].height);
        
        // Add quality options
        sortedQualities.forEach(([label, data]) => {
            const item = document.createElement('div');
            item.className = 'quality-item';
            item.setAttribute('data-quality', data.height);
            
            const bandwidth = Math.round(data.bandwidth / 1000);
            item.innerHTML = `
                <span>${label}</span>
                <small>${bandwidth}k</small>
            `;
            
            item.addEventListener('click', () => this.setQuality(data.height));
            dropdown.appendChild(item);
        });
    }
    
    setQuality(quality) {
        if (!this.player) return;
        
        const tracks = this.player.getVariantTracks();
        
        if (quality === 'auto') {
            // Enable adaptive bitrate
            this.player.configure({
                abr: { enabled: true }
            });
            this.elements.currentQuality.textContent = 'Auto';
        } else {
            // Disable adaptive bitrate and select specific quality
            this.player.configure({
                abr: { enabled: false }
            });
            
            // Find tracks with the specified height
            const selectedTracks = tracks.filter(track => track.height === quality);
            if (selectedTracks.length > 0) {
                // Select the track with highest bandwidth for this resolution
                const bestTrack = selectedTracks.reduce((best, current) => 
                    current.bandwidth > best.bandwidth ? current : best
                );
                this.player.selectVariantTrack(bestTrack, true);
                this.elements.currentQuality.textContent = `${quality}p`;
            }
        }
        
        // Update active state in dropdown
        this.elements.qualityDropdown.querySelectorAll('.quality-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-quality') === quality.toString()) {
                item.classList.add('active');
            }
        });
        
        // Close dropdown
        this.elements.qualityDropdown.classList.remove('show');
    }
    
    updateChannelStatus(channelId, status) {
        this.channelStatus.set(channelId, status);
        
        // Update the visual indicator
        const indicator = document.querySelector(`[data-channel-id="${channelId}"]`);
        if (indicator) {
            indicator.classList.remove('unknown', 'ok', 'error');
            indicator.classList.add(status);
            
            if (status === 'error') {
                indicator.title = 'Channel not playable';
            } else if (status === 'ok') {
                indicator.title = 'Channel working';
            } else {
                indicator.title = 'Status unknown';
            }
        }
    }
    
    async checkChannelPlayability(channel) {
        const channelId = channel.id || channel.name;
        let testPlayer = null;
        
        try {
            // Create a temporary video element for testing (lighter than full Shaka Player)
            const testVideo = document.createElement('video');
            testVideo.muted = true;
            testVideo.style.display = 'none';
            document.body.appendChild(testVideo);
            
            // Create a temporary player for testing
            testPlayer = new shaka.Player(testVideo);
            
            // Configure DRM if needed
            if (channel.drm && channel.drm.type !== 'none') {
                if (channel.drm.type === 'clearkey') {
                    const clearKeys = {};
                    clearKeys[channel.drm.keyId] = channel.drm.key;
                    testPlayer.configure({
                        drm: { 
                            clearKeys: clearKeys,
                            retryParameters: {
                                maxAttempts: 1,
                                baseDelay: 1000
                            }
                        }
                    });
                } else if (channel.drm.type === 'widevine') {
                    testPlayer.configure({
                        drm: {
                            servers: {
                                'com.widevine.alpha': channel.drm.licenseUri
                            },
                            retryParameters: {
                                maxAttempts: 1,
                                baseDelay: 1000
                            }
                        }
                    });
                }
            }
            
            // Set shorter timeouts for health checks
            testPlayer.configure({
                manifest: {
                    retryParameters: {
                        maxAttempts: 1,
                        baseDelay: 1000
                    }
                },
                streaming: {
                    retryParameters: {
                        maxAttempts: 1,
                        baseDelay: 1000
                    }
                }
            });
            
            // Try to load the manifest with shorter timeout
            const loadPromise = testPlayer.load(channel.manifest);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Health check timeout')), 6000)
            );
            
            await Promise.race([loadPromise, timeoutPromise]);
            
            // If we get here, the channel is playable
            this.updateChannelStatus(channelId, 'ok');
            
            // Clean up test video element
            if (testVideo && testVideo.parentNode) {
                testVideo.parentNode.removeChild(testVideo);
            }
            
        } catch (error) {
            // Only log in development mode
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.warn(`Channel ${channel.name} health check failed:`, error.message);
            }
            this.updateChannelStatus(channelId, 'error');
        } finally {
            // Clean up test player
            if (testPlayer) {
                try {
                    await testPlayer.destroy();
                } catch (cleanupError) {
                    // Ignore cleanup errors
                }
            }
        }
    }
    
    async performChannelHealthCheck() {
        console.log('Starting channel health check...');
        
        // Check channels in smaller batches with longer delays
        const batchSize = 2;
        for (let i = 0; i < this.channels.length; i += batchSize) {
            const batch = this.channels.slice(i, i + batchSize);
            
            // Process batch with sequential checks to be gentler on servers
            for (const channel of batch) {
                try {
                    await this.checkChannelPlayability(channel);
                } catch (error) {
                    // Only log in development
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        console.warn(`Failed to check ${channel.name}:`, error);
                    }
                }
                
                // Small delay between individual checks
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Longer delay between batches
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('Channel health check completed');
    }
    
    async triggerManualHealthCheck() {
        const btn = this.elements.healthCheckBtn;
        const originalText = btn.innerHTML;
        
        // Update button state
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-clockwise spin"></i> Checking...';
        
        try {
            // Reset all channel statuses
            this.channelStatus.clear();
            
            // Re-render channels to reset indicators
            this.renderChannels();
            
            // Perform health check
            await this.performChannelHealthCheck();
            
            // Show completion message
            btn.innerHTML = '<i class="bi bi-check-circle"></i> Completed';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('Health check failed:', error);
            btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i> Failed';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }
    
    showLoading() {
        this.elements.loadingSpinner.classList.remove('hidden');
    }
    
    hideLoading() {
        this.elements.loadingSpinner.classList.add('hidden');
    }
    
        showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.errorNotification.classList.add('show');
        
        // Auto-hide after 8 seconds
        setTimeout(() => {
            this.hideError();
        }, 8000);
    }

    hideError() {
        this.elements.errorNotification.classList.remove('show');
    }
    
    updateStatus(status, type) {
        this.elements.playbackStatus.textContent = status;
        this.elements.playbackStatus.className = `badge bg-${type}`;
    }

    // Hash routing methods for direct channel URLs
    handleInitialRouting() {
        const hash = window.location.hash.substring(1); // Remove the # symbol
        
        if (hash && this.channels.length > 0) {
            const channelIndex = this.findChannelByHash(hash);
            if (channelIndex !== -1) {
                console.log(`Loading channel from URL hash: ${hash}`);
                this.selectChannel(channelIndex);
                return;
            } else {
                console.warn(`Channel not found for hash: ${hash}`);
            }
        }
        
        // Default: select first channel if no hash or hash not found
        if (this.channels.length > 0) {
            this.selectChannel(0);
        }
    }

    handleHashChange() {
        const hash = window.location.hash.substring(1);
        
        if (hash) {
            const channelIndex = this.findChannelByHash(hash);
            if (channelIndex !== -1 && channelIndex !== this.currentChannelIndex) {
                console.log(`Changing channel via hash: ${hash}`);
                this.selectChannel(channelIndex);
            }
        }
    }

    findChannelByHash(hash) {
        // Convert hash to lowercase for comparison
        const searchHash = hash.toLowerCase();
        
        // First try exact match with generated hashtag (without #)
        for (let i = 0; i < this.channels.length; i++) {
            const channelHash = this.generateHashtag(this.channels[i].name).substring(1); // Remove #
            if (channelHash === searchHash) {
                return i;
            }
        }
        
        // If no exact match, try partial matches with channel names
        for (let i = 0; i < this.channels.length; i++) {
            const channelName = this.channels[i].name.toLowerCase();
            // Remove common suffixes and special characters for comparison
            const cleanChannelName = channelName
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, '')
                .replace(/hd$/i, '')
                .replace(/tv$/i, '');
            
            if (cleanChannelName.includes(searchHash) || searchHash.includes(cleanChannelName)) {
                return i;
            }
        }
        
        return -1; // Not found
    }

    updateUrlHash() {
        if (this.currentChannel) {
            const hash = this.generateHashtag(this.currentChannel.name);
            // Update URL without triggering hashchange event
            const newUrl = window.location.pathname + window.location.search + hash;
            window.history.replaceState(null, '', newUrl);
        }
    }

    // Video controls show/hide methods
    showVideoControls() {
        const videoContainer = document.querySelector('.video-container');
        videoContainer.classList.add('show-controls');
        
        // Clear any existing hide timeout
        clearTimeout(this.controlsHideTimeout);
        
        // Set timeout to hide controls after 3 seconds of no activity
        this.controlsHideTimeout = setTimeout(() => {
            this.hideVideoControls();
        }, 3000);
    }

    hideVideoControls() {
        const videoContainer = document.querySelector('.video-container');
        videoContainer.classList.remove('show-controls');
        
        // Clear the hide timeout
        clearTimeout(this.controlsHideTimeout);
    }
    
    handleChannelNumberInput(digit) {
        // Clear any existing timeout
        if (this.channelNumberTimeout) {
            clearTimeout(this.channelNumberTimeout);
        }
        
        // Add digit to input
        this.channelNumberInput += digit;
        
        // Show channel number display
        this.showChannelNumberDisplay();
        
        // Set timeout to process the input (2 seconds)
        this.channelNumberTimeout = setTimeout(() => {
            this.processChannelNumberInput();
        }, 2000);
        
        // If we have enough digits for the max channel number, process immediately
        const maxChannelNumber = this.filteredChannels.length;
        const maxDigits = maxChannelNumber.toString().length;
        
        if (this.channelNumberInput.length >= maxDigits) {
            const channelNumber = parseInt(this.channelNumberInput);
            if (channelNumber <= maxChannelNumber) {
                clearTimeout(this.channelNumberTimeout);
                this.processChannelNumberInput();
            }
        }
    }
    
    processChannelNumberInput() {
        const channelNumber = parseInt(this.channelNumberInput);
        
        if (channelNumber >= 1 && channelNumber <= this.filteredChannels.length) {
            // Switch to channel (subtract 1 because array is 0-indexed)
            this.selectChannel(channelNumber - 1);
            this.playCurrentChannel();
            
            console.log(`Switched to channel ${channelNumber}: ${this.filteredChannels[channelNumber - 1].name}`);
        } else {
            console.warn(`Invalid channel number: ${channelNumber}`);
        }
        
        // Clear input and hide display
        this.channelNumberInput = '';
        this.hideChannelNumberDisplay();
        this.channelNumberTimeout = null;
    }
    
    showChannelNumberDisplay() {
        if (this.elements.channelNumberDisplay) {
            this.elements.channelNumberDisplay.textContent = this.channelNumberInput;
            this.elements.channelNumberDisplay.classList.add('show');
        }
    }
    
    hideChannelNumberDisplay() {
        if (this.elements.channelNumberDisplay) {
            this.elements.channelNumberDisplay.classList.remove('show');
        }
    }

}

function retryCurrentChannel() {
    if (window.channelPlayer && window.channelPlayer.currentChannel) {
        window.channelPlayer.playCurrentChannel();
    }
}

function closeErrorNotification() {
    if (window.channelPlayer) {
        window.channelPlayer.hideError();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.channelPlayer = new ChannelPlayer();
    document.getElementById('loadingSpinner').classList.add('hidden');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.channelPlayer) {
        window.channelPlayer.destroy();
    }
});

console.log('Channel Player with Shaka Player support loaded successfully'); 