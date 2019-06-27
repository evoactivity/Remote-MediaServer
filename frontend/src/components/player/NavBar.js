import React, { Component } from 'react';
import { Button } from 'react-materialize';
import ButtonMenu from './ButtonMenu';
import { connect } from 'react-redux';
import { playQueueActions } from '../../helpers/stores/playQueue';
import { Redirect } from 'react-router-dom';

class NavBar extends Component {
  playPauseButton() {
    if (this.props.paused) {
      return <Button id="play-pause" floating large icon="play_arrow" onClick={this.props.togglePause} />;
    }
    return <Button id="play-pause" floating large icon="pause" onClick={this.props.togglePause} />;
  }

  async componentWillReceiveProps(nextProps) {
    if (!this.state || !this.state.mediaContent) {
      this.setState({ mediaContent: nextProps.mediaContent });
    }
  }

  selected(type, item) {
    this.props.onSelectContent(type, item.value);
  }

  render() {
    const { playing } = this.props.playQueue;
    const { onSelectContent } = this.props;
    const { mediaContent } = playing;
    if (!playing || !mediaContent) {
      return <div />;
    }
    // if(this.state.desiredId && playing.id !== this.state.desiredId) {
    //   console.log('redirect', `/item/view/${this.state.desiredId}`);`
    //   return <Redirect push={true} to={`/item/view/${this.state.desiredId}`}/>
    // }
    return (
      <div className="controls">
        <img alt="poster" src={playing ? `/img/${playing.id}_poster.jpg` : ''} />
        <Button id="prev" floating icon="skip_previous" onClick={() => this.props.skip(-1)} />
        {this.playPauseButton()}
        <Button id="next" floating icon="skip_next" onClick={() => this.props.skip(1)} />
        <div className="buttonsRight">
          <ButtonMenu onSelect={onSelectContent} type="audio" items={mediaContent.audio} />
          <ButtonMenu onSelect={onSelectContent} type="video" items={mediaContent.video} />
          <ButtonMenu onSelect={onSelectContent} type="subtitles" items={mediaContent.subtitles} />
          <Button id="fullscreen" floating icon="fullscreen" onClick={this.props.toggleFullScreen} />
        </div>
        {this.props.children}
      </div>
    );
  }
}

export default connect(({ playQueue }) => ({ playQueue }), playQueueActions)(NavBar);
