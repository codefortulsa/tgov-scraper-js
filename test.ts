import ffmpeg from "fluent-ffmpeg";

async function test() {
  await new Promise((resolve, reject) => ffmpeg("https://archive-stream.granicus.com/OnDemand/_definst_/mp4:archive/tulsa-ok/tulsa-ok_915aa832-55e4-4e0e-8370-3ebba464e96f.mp4/playlist.m3u8")
    .inputOptions("-protocol_whitelist", "file,http,https,tcp,tls,crypto")
    .outputOptions("-c", "copy")
    .output("output.mp4")
    .on("codecData", (data) => {
      console.log(data);
    })
    .on("progress", (progress) => {
      console.log(progress);
    })
    .on("end", () => {
      console.log("end");
      resolve(void 0);
    })
    .on("error", (err) => {
      console.error(err);
      reject(err);
    })
    .run());
}

test().then(() => console.log("done"));
