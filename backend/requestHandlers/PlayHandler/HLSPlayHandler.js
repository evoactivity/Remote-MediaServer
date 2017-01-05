/**
 * Created by owenray on 08-04-16.
 */
"use strict";
var spawn = require('child_process').spawn;
var os = require('os');
var fs = require("fs");
var url = require("url");
var Settings = require("../../Settings");
var FFProbe = require("../../FFProbe");
var uuid = require('node-uuid');

var MediaItemHelper = require("../../helpers/MediaItemHelper");
var Debug = require("../../helpers/Debug");
var IPlayHandler = require("./IPlayHandler");
var FileRequestHandler = require("../FileRequestHandler");
const Duplex = require('stream').Duplex;

class HLSPlayHandler extends IPlayHandler{
    play(mediaItem, offset, request, response)
    {
        this.request = request;
        this.response = response;
        var u = url.parse(offset, true);

        if(u.query.format!="hls"&&
            (request.headers["user-agent"].indexOf("Chrome")!==-1||
            request.headers["user-agent"].indexOf("Safari")===-1)) {
            console.log("test");
            return false;
        }

        this.offset = u.pathname;
        //console.log("q:");
        if(!u.query||!u.query.session||!HLSPlayHandler.sessions[u.query.session]) {
            console.log("STARTING NEW HLS SESSION!!!");
            this.response.statusCode=302;
            var id = uuid.v4();
            this.session = id;
            this.response.setHeader("Location", "http://192.168.222.100:8080/ply/1021/0?format=hls&session="+id);
            HLSPlayHandler.sessions[id] = this;
            this.response.end("");
        }else{
            HLSPlayHandler.sessions[u.query.session].newRequest(request, response, u.query.segment);
            return true;
        }

        var dir = os.tmpdir()+"/"+this.session;
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        this.m3u8 = dir+"/vid.m3u8";
        this.file = MediaItemHelper.getFullFilePath(mediaItem);
        Debug.debug("starting to play:"+this.file);
        FFProbe.getInfo(this.file).then(this.gotInfo.bind(this), this.onError.bind(this));
        return true;
    }

    newRequest(request, response, segment) {
        if(segment) { //serve m3u8
            console.log("ts requested", request.headers, request.url, os.tmpdir() + "/" + this.session + "/" + segment);
            return new FileRequestHandler(request, response)
                .serveFile(os.tmpdir() + "/" + this.session + "/" + segment);
        }

        console.log("m3u8 requested");
        fs.exists(this.m3u8, function(does) {
            if (!does) {
                setTimeout(function () {
                    setTimeout(function() {
                        this.newRequest(request, response, segment);
                    }.bind(this), 5000);
                }.bind(this), 500);
                return;
            }
            new FileRequestHandler(request, response).serveFile(this.m3u8);
        }.bind(this));
        //server ts video file
    }

    gotInfo(info, correctedOffset)
    {
        if(!correctedOffset&&this.offset!=0)
        {
            FFProbe.getNearestKeyFrame(this.file, this.offset)
                .then(
                    function(offset){
                        //this.offset = offset;
                        this.offset = offset;
                        Debug.debug("play from 2:", offset);
                        this.gotInfo(info, true);
                    }.bind(this),
                    this.onError.bind(this)
                );
            return;
        }
        if(!info||!info.format)
        {
            Debug.warning("VIDEO ERROR!");
            this.response.end();
            return;
        }

        var vCodec = "libx264";
        var aCodec = "aac";

        var supportedVideoCodecs = {"h264":1};
        var supportedAudioCodecs = {"aac":1};


        for(var key in info.streams)
        {
            var stream = info.streams[key];
            if(stream.codec_type=="video"&&supportedVideoCodecs[stream.codec_name])
            {
                vCodec = "copy";
            }
            if(stream.codec_type=="audio"&&supportedAudioCodecs[stream.codec_name])
            {
                aCodec = "copy";
            }
        }
        var duration = Math.round((info.format.duration-this.offset)*1000);
        Debug.debug("setDuration", duration);

        // om keyframe te vinden, gaat wellicht veel fixen:
        // ffprobe.exe -read_intervals 142%+#1  -show_frames -select_streams v:0 -print_format json  "//home/nzbget/downloads/complete/MoviesComplete\Hitman Agent 47 2015 BluRay 720p DTS-ES x264-ETRG\Hitman Agent 47 2015 BluRay 720p DTS x264-ETRG.mkv" | grep pts_time
        var args = [
            "-re", // <-- should read the file at running speed... but a little to slow...
            "-probesize", "50000000",
            "-thread_queue_size", "1024",
            "-i", this.file,

            "-stdin",
            "-vcodec", vCodec,
            "-hls_time", 1,
            "-hls_list_size", 0,
            "-hls_base_url", "http://192.168.222.100:8080/ply/1021/0?format=hls&session="+this.session+"&segment=",
            "-bsf:v", "h264_mp4toannexb",
            "-acodec", aCodec,
            "-strict", "-2",
            "D:/tmpdir/this.m3u8"

        ];
        if(aCodec!="copy")
        {
            Debug.debug("mixing down to 2 AC!");
            args.splice(20, 0, "-ac", 2, "-ab", "192k");
        }
        if(this.offset!=0) {
            args.splice(8, 0, "-ss", 0);
            args.splice(4, 0, "-ss", this.offset);
        }
        Debug.info("starting ffmpeg:"+Settings.getValue("ffmpeg_binary")+" "+args.join(" "));
        var str = fs.createWriteStream(null, { fd: 4 });
        var proc = spawn(
            Settings.getValue("ffmpeg_binary"),
            args,
            {
                "shell":true
                ,"stdio":["pipe", null, "pipe", this.str]
            });
        this.proc = proc;
        //process.stdin.pause();
        process.stdin.on("data", function(data){
            console.log("?", data);
        });

        str.on("data", function(){
            console.log("strdata", arguments);
        });
        proc.stdout.on('data', this.onError.bind(this));
        //proc.stdin.write()
        /*proc.stdin.on("error", function(){
            console.log("stdinErr!", arguments);
        })*/
        proc.stdin.resume();
        setTimeout(function() {
            console.log("pause stdout");
            console.log("write1", proc.stdin.write("c", function(){
                console.log("written?", arguments);
            }));
            //proc.stdin.end();
            //proc.stdin.pause();
        }, 6000);
        proc.stderr.on('data', this.onError.bind(this));
        proc.on('close', this.onClose.bind(this))
        proc.on('drain', function(){
            //proc.stdout.resume();
        });
    }

    onError(data)
    {
        Debug.warning("ffmpeg error:"+`${data}`);
    }

    onClose(code)
    {
        Debug.debug("Close:"+code);
    }
}

HLSPlayHandler.sessions = [];

module.exports = HLSPlayHandler;