/* global chrome */

class ChromeCast{
  EVENT_CASTING_CHANGE = "CASTING_CHANGE";
  EVENT_ONPLAY = "EVENT_ONPLAY";

  constructor() {
    this.events = {};
    window['__onGCastApiAvailable'] = this.onApiAvailable.bind(this);
  }

  onApiAvailable(available) {
    if (!available) {
      return;
    }
    const apiConfig = new chrome.cast.ApiConfig(
      new chrome.cast.SessionRequest("07EA9E92"),
      this.onSession.bind(this),
      this.onReceiver.bind(this),
      chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
    );

    chrome.cast.initialize(apiConfig, this.onInit.bind(this));
  }

  onInit() {
  }

  onSession(session) {
    this.session = session;
    this.trigger(this.EVENT_CASTING_CHANGE, [true]);
  }

  onReceiver(e) {
    if(e==="available") {
      this._available = true;
    }
  }

  isAvailable() {
    return this._available;
  }

  startCasting() {
    chrome.cast.requestSession(this.onRequestSession.bind(this));
  }

  stopCasting() {
    if(this.session) {
      this.session.leave();
      this.trigger(this.EVENT_CASTING_CHANGE, [false]);
    }
  }

  onRequestSession(session) {
    this.session = session;
    this.trigger(this.EVENT_CASTING_CHANGE, [true]);
  }

  trigger(event, args) {
    if(this.events[event]) {
      for(let key in this.events[event]) {
        this.events[event][key].apply(null, args);
      }
    }
  }

  addListener(event, callback) {
    if(!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  removeListener(event, callback) {
    for(let key in this.events[event]) {
      if(this.events[event][key]===callback) {
        this.events[event].splice(key, 1);
      }
    }
  }

  setMedia(media, contentType) {
    if(!this.session) {
      return;
    }
    const mediaInfo = new chrome.cast.media.MediaInfo(media, contentType);
    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    this.session.loadMedia(
      request,
      media=>{
        this.media=media;
        this.trigger(this.EVENT_ONPLAY);
      }
    );

  }

  setVolume(volume) {
    if(this.media) {
      const request = new chrome.cast.media.VolumeRequest(
        new chrome.cast.Volume(volume)
      );
      this.media.setVolume(request);
    }
  }

  getVolume() {
    return this.media.volume.level;
  }

  play() {
    if(this.media) {
      this.media.play();
    }
  }

  pause() {
    if(this.media) {
      this.media.pause();
    }
  }

  isActive() {
    return !!this.session;
  }

  getOffset() {
    if(!this.media) {
      return 0;
    }
    return this.media.getEstimatedTime();
  }
}

export default new ChromeCast();