class YouTubePlaylist {
  constructor() {
    this.apiKey = "";
    this.playlistUrl = "";
    this.availableVideoIds = [];
    this.unavailableVideoIds = [];
    this.apiCallCount = 0; // Initialize API call counter
  }

  async fetchVideoIds() {
    try {
      this.disableButtons();
      const playlistId = this.extractPlaylistId(this.playlistUrl);
      let nextPageToken = "";
      this.availableVideoIds = [];
      this.unavailableVideoIds = [];

      while (nextPageToken !== undefined) {
        const response = await this.makeApiCall(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,status&maxResults=50&playlistId=${playlistId}&key=${this.apiKey}&pageToken=${nextPageToken}`
        );
        if (!response.ok) throw new Error(`Error: ${response.statusText}`);
        const data = await response.json();

        if (data.items) {
          data.items.forEach((item) => {
            if (
              item.status.privacyStatus === "private" ||
              item.status.privacyStatus === "unlisted" ||
              item.status.privacyStatus === "public"
            ) {
              this.availableVideoIds.push(item.contentDetails.videoId);
            } else {
              this.unavailableVideoIds.push(item.contentDetails.videoId);
            }
            // Update the textarea in real-time
            this.updateOutputTextarea(
              `Available Video IDs: ${JSON.stringify(
                this.availableVideoIds,
                null,
                2
              )}\nUnavailable Video IDs: ${JSON.stringify(
                this.unavailableVideoIds,
                null,
                2
              )}`
            );
          });
        }

        nextPageToken = data.nextPageToken;
      }

      console.log("Available Video IDs:", this.availableVideoIds);
      console.log("Unavailable Video IDs:", this.unavailableVideoIds);
    } catch (error) {
      this.updateOutputTextarea(`Error fetching video IDs: ${error.message}`);
      console.error("Error fetching video IDs:", error);
    } finally {
      this.enableButtons();
    }
  }

  async fetchVideoDurations() {
    try {
      this.disableButtons();
      if (this.availableVideoIds.length === 0) {
        await this.fetchVideoIds();
      }

      let videoDetailsArray = [];
      const batchSize = 50; // Maximum number of video IDs per API call
      const videoIdChunks = this.chunkArray(this.availableVideoIds, batchSize);

      // Initialize the start time
      let currentTime = 0;

      for (const chunk of videoIdChunks) {
        const response = await this.makeApiCall(
          `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${chunk.join(
            ","
          )}&key=${this.apiKey}`
        );
        if (!response.ok) throw new Error(`Error: ${response.statusText}`);
        const data = await response.json();

        if (data.items) {
          data.items.forEach((item) => {
            let duration = this.convertISO8601ToSeconds(
              item.contentDetails.duration
            );
            duration = this.adjustDuration(duration);
            videoDetailsArray.push({
              videoId: item.id,
              startTime: currentTime,
              endTime: currentTime + duration,
            });
            currentTime += duration; // Update current time for the next video

            // Update the textarea in real-time
            this.updateOutputTextarea(
              JSON.stringify(videoDetailsArray, null, 2)
            );
          });
        }
      }
      console.log(videoDetailsArray);
      return videoDetailsArray;
    } catch (error) {
      this.updateOutputTextarea(
        `Error fetching video durations: ${error.message}`
      );
      console.error("Error fetching video durations:", error);
    } finally {
      this.enableButtons();
    }
  }

  adjustDuration(duration) {
    // Add a small buffer of ±1 second to the duration to account for inaccuracies
    const minBuffer = Math.max(0, duration - 1); // Ensure no negative durations
    const maxBuffer = duration + 1;
    return Math.round((minBuffer + maxBuffer) / 2); // Average of min and max buffers
  }

  extractPlaylistId(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get("list");
  }

  chunkArray(array, size) {
    const chunkedArray = [];
    for (let i = 0; i < array.length; i += size) {
      chunkedArray.push(array.slice(i, i + size));
    }
    return chunkedArray;
  }

  convertISO8601ToSeconds(isoDuration) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = regex.exec(isoDuration);

    const hours = parseInt(matches[1] || 0, 10);
    const minutes = parseInt(matches[2] || 0, 10);
    const seconds = parseInt(matches[3] || 0, 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  createMasterPlaylist(videoDetailsArray) {
    const masterPlaylist = [];
    let currentPlaylist = [];
    let currentTime = 0;
    const maxDuration = 12 * 3600; // 12 hours in seconds

    for (const video of videoDetailsArray) {
      if (currentTime + (video.endTime - video.startTime) > maxDuration) {
        masterPlaylist.push(currentPlaylist);
        currentPlaylist = [];
        currentTime = 0;
      }

      currentPlaylist.push({
        videoId: video.videoId,
        startTime: currentPlaylist.length === 0 ? 0 : currentTime,
        endTime:
          currentPlaylist.length === 0
            ? video.endTime - video.startTime
            : currentTime + (video.endTime - video.startTime),
      });
      currentTime += video.endTime - video.startTime;
    }

    if (currentPlaylist.length > 0) {
      masterPlaylist.push(currentPlaylist);
    }

    // If the last playlist is significantly shorter, fill it with random videos from other playlists
    const averageLength = Math.floor(
      masterPlaylist.reduce((sum, list) => sum + list.length, 0) /
        masterPlaylist.length
    );
    const lastPlaylist = masterPlaylist[masterPlaylist.length - 1];

    if (lastPlaylist.length < averageLength) {
      const allOtherVideos = masterPlaylist.slice(0, -1).flat();
      while (lastPlaylist.length < averageLength && allOtherVideos.length > 0) {
        const randomIndex = Math.floor(Math.random() * allOtherVideos.length);
        const randomVideo = allOtherVideos.splice(randomIndex, 1)[0];
        const lastVideoEndTime = lastPlaylist[lastPlaylist.length - 1].endTime;
        lastPlaylist.push({
          videoId: randomVideo.videoId,
          startTime: lastVideoEndTime,
          endTime:
            lastVideoEndTime + (randomVideo.endTime - randomVideo.startTime),
        });
      }
    }
    console.log(masterPlaylist);
    return masterPlaylist;
  }

  updateOutputTextarea(content) {
    outputTextarea.value = content;
    outputTextarea.scrollTop = outputTextarea.scrollHeight;
  }

  setApiKeyAndPlaylistUrl(apiKey, playlistUrl) {
    this.apiKey = apiKey;
    this.playlistUrl = playlistUrl;
  }

  validateInputs() {
    if (!this.apiKey || !this.playlistUrl) {
      alert("Both API key and Playlist URL are required.");
      return false;
    }
    return true;
  }

  async makeApiCall(url) {
    this.apiCallCount++;
    this.updateApiCallCount();
    return fetch(url);
  }

  updateApiCallCount() {
    const apiCallCountElement = document.getElementById("apiCallCount");
    apiCallCountElement.textContent = this.apiCallCount;
  }

  disableButtons() {
    getIdsButton.disabled = true;
    getTimesButton.disabled = true;
    masterButton.disabled = true;
  }

  enableButtons() {
    getIdsButton.disabled = false;
    getTimesButton.disabled = false;
    masterButton.disabled = false;
  }
}

// Initialize YouTubePlaylist instance
const ytPlaylist = new YouTubePlaylist();

// Get buttons and textarea by their IDs
const getIdsButton = document.getElementById("all-ids");
const getTimesButton = document.getElementById("all-times");
const masterButton = document.getElementById("masterPlaylist");
const outputTextarea = document.getElementById("output");
const copyTextButton = document.getElementById("copyText");
const downloadFileButton = document.getElementById("downloadFile");

// Get input fields
const apiKeyInput = document.getElementById("apiKey");
const playlistUrlInput = document.getElementById("playlistUrl");

// Add event listeners to buttons
getIdsButton.addEventListener("click", async () => {
  outputTextarea.value = ""; // Clear textarea
  ytPlaylist.setApiKeyAndPlaylistUrl(apiKeyInput.value, playlistUrlInput.value);
  if (ytPlaylist.validateInputs()) {
    await ytPlaylist.fetchVideoIds();
  }
});

getTimesButton.addEventListener("click", async () => {
  outputTextarea.value = ""; // Clear textarea
  ytPlaylist.setApiKeyAndPlaylistUrl(apiKeyInput.value, playlistUrlInput.value);
  if (ytPlaylist.validateInputs()) {
    const videoDetailsArray = await ytPlaylist.fetchVideoDurations();
    outputTextarea.value = JSON.stringify(videoDetailsArray, null, 2);
    outputTextarea.scrollTop = outputTextarea.scrollHeight; // Scroll to the bottom
  }
});

masterButton.addEventListener("click", async () => {
  outputTextarea.value = ""; // Clear textarea
  ytPlaylist.setApiKeyAndPlaylistUrl(apiKeyInput.value, playlistUrlInput.value);
  if (ytPlaylist.validateInputs()) {
    const videoDetailsArray = await ytPlaylist.fetchVideoDurations(); // Ensure durations are fetched
    const shuffledVideoDetails = ytPlaylist.shuffleArray(videoDetailsArray);
    const masterPlaylist =
      ytPlaylist.createMasterPlaylist(shuffledVideoDetails);
    outputTextarea.value = JSON.stringify(masterPlaylist, null, 2);
    outputTextarea.scrollTop = outputTextarea.scrollHeight; // Scroll to the bottom
  }
});

copyTextButton.addEventListener("click", () => {
  navigator.clipboard
    .writeText(outputTextarea.value)
    .then(() => {
      alert("Text copied to clipboard!");
    })
    .catch((err) => {
      alert("Failed to copy text: ", err);
    });
});

downloadFileButton.addEventListener("click", () => {
  const blob = new Blob(
    [`export const masterPlaylist = ${outputTextarea.value};`],
    { type: "application/javascript" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "masterPlaylist.js";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});
