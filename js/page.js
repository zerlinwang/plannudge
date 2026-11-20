// The method walkthrough and the video selector.
(function () {
  const $ = (id) => document.getElementById(id);

  // Join the last two words of a text block with a non-breaking space, so that the last line never holds one word.
  function noOrphan(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) last = walker.currentNode;
    if (!last) return;
    const text = last.nodeValue.replace(/\s+$/, "");
    const i = text.lastIndexOf(" ");
    if (i > 0) last.nodeValue = text.slice(0, i) + "\u00A0" + text.slice(i + 1);
  }
  const TEXT_BLOCKS = "p, li, figcaption, summary, .tldr, .stats span, .facts span, .takeaways div, .dn-label small";
  document.querySelectorAll(TEXT_BLOCKS).forEach(noOrphan);

  // The page draws its own control bar below a video. The browser controls would cover the curves
  // with a dark bar, and they contain a volume button although the videos have no sound.
  function controlBar(video, bar) {
    const toggle = bar.querySelector("button"), seek = bar.querySelector("input"), time = bar.querySelector("span");
    const clock = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
    const playPause = () => (video.paused ? video.play() : video.pause());
    const showState = () => {
      toggle.textContent = video.paused ? "▶" : "❚❚";
      toggle.setAttribute("aria-label", video.paused ? "Play" : "Pause");
    };
    const showTime = () => {
      const d = video.duration || 0;
      seek.value = d ? (video.currentTime / d) * 1000 : 0;
      time.textContent = clock(video.currentTime) + " / " + clock(d);
    };
    video.addEventListener("click", playPause);
    toggle.addEventListener("click", playPause);
    video.addEventListener("play", showState);
    video.addEventListener("pause", showState);
    video.addEventListener("timeupdate", showTime);
    video.addEventListener("loadedmetadata", showTime);
    seek.addEventListener("input", () => {
      if (video.duration) video.currentTime = (seek.value / 1000) * video.duration;
    });
    showState();
  }

  // The video under the TL;DR plays at 2 times the normal speed.
  const teaser = $("teaser-video");
  teaser.defaultPlaybackRate = 2;
  teaser.playbackRate = 2;
  controlBar(teaser, $("teaser-bar"));

  // ---------- How PlanNudge works: steps over the method figure ----------
  // box = [left, top, width, height] in percent of the figure
  const STEPS = [
    {
      title: "1. The frozen planner makes a base plan",
      text: "The pretrained diffusion-based planner denoises a plan in K steps. Its weights never change.",
      box: [1.5, 11, 28.5, 35],
    },
    {
      title: "2. The nudge policy outputs two numbers",
      text: "An MLP reads the ego state, the pooled scene features, and the beginning of the base plan. One forward pass outputs a speed offset and a curvature offset.",
      box: [6, 53.5, 41.5, 23],
    },
    {
      title: "3. The plan transform applies the nudge",
      text: "A fixed transform, without learned parameters, applies the two offsets to the base plan. A zero nudge returns the base plan exactly.",
      box: [36, 11, 29, 35],
    },
    {
      title: "4. The simulator executes the nudged plan",
      text: "The tracker follows the nudged plan for 0.1 s. The reward is the closed-loop score, plus a small safety penalty at every step.",
      box: [71, 11, 28.5, 35],
    },
    {
      title: "5. Off-policy RL trains the nudge policy",
      text: "TD3 trains the critic and the nudge policy from a replay buffer. No update calls the denoising process.",
      box: [0.5, 49.5, 99, 50],
    },
  ];
  const tabs = $("method-tabs"), highlight = $("method-highlight");
  function showStep(i) {
    const s = STEPS[i];
    $("method-text").textContent = s.text;
    noOrphan($("method-text"));
    [...tabs.children].forEach((b, j) => b.setAttribute("aria-selected", j === i));
    const [l, t, w, h] = s.box;
    Object.assign(highlight.style, { left: l + "%", top: t + "%", width: w + "%", height: h + "%" });
  }
  STEPS.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s.title;
    b.addEventListener("click", () => showStep(i));
    tabs.appendChild(b);
  });
  showStep(0);

  // ---------- Visualizations ----------
  const VIDEOS = [
    ["fig04a_faster_vehicle_from_behind", "Faster vehicle from behind", "Non-reactive traffic. A faster vehicle approaches from behind. PlanNudge slows down and steers right, and the vehicle overtakes on the left."],
    ["fig04b_pedestrians", "Pedestrians", "Reactive traffic. Pedestrians stand at the right edge of the lane. The pretrained planner hits one of them. PlanNudge slows down and steers left, away from them."],
    ["fig11_left_turn", "Left turn", "Non-reactive traffic. The pretrained planner does not turn sharply enough and leaves the drivable area at 8.6 s. PlanNudge steers further left."],
    ["fig12_vehicle_enters_lane", "Vehicle enters the lane", "Non-reactive traffic. A vehicle enters the ego vehicle's lane from the left. PlanNudge steers right."],
    ["fig13_vehicle_crosses_ahead", "Vehicle crosses ahead", "Non-reactive traffic. A vehicle crosses ahead. PlanNudge slows down to let it pass."],
    ["fig14_vehicle_in_right_lane", "Vehicle in the right lane", "Reactive traffic. A vehicle drives beside the ego vehicle in the right lane. The pretrained planner collides with it at 10.4 s. PlanNudge steers left and passes it."],
    ["fig15_queue_departs", "Queue departs", "Reactive traffic. A queue departs at an intersection. The pretrained planner follows too slowly. PlanNudge increases the planned speed."],
    ["fig16_start_from_standstill", "Start from standstill", "Reactive traffic. The pretrained planner barely moves until the end of the scenario. PlanNudge increases the planned speed and departs."],
  ];
  const vTabs = $("video-tabs"), player = $("video-player");
  controlBar(player, $("video-bar"));
  function showVideo(i) {
    const [file, , caption] = VIDEOS[i];
    player.src = "assets/videos/" + file + ".mp4";
    $("video-caption").textContent = caption;
    noOrphan($("video-caption"));
    [...vTabs.children].forEach((b, j) => b.setAttribute("aria-selected", j === i));
  }
  VIDEOS.forEach((v, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = v[1];
    b.addEventListener("click", () => {
      showVideo(i);
      player.play();
    });
    vTabs.appendChild(b);
  });
  showVideo(0);
})();
