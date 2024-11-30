console.log("Background script starting...");

async function callOpenAI(message, context, port) {
  try {
    // 获取设置
    const { apiKey, model } = await chrome.storage.sync.get([
      "apiKey",
      "model",
    ]);

    if (!apiKey) {
      console.log("No API key found");
      port.postMessage({ error: "请先在设置页面配置 API Key" });
      return;
    }

    // 使用 GPT-4 Omni 作为默认模型
    const useModel = model || "gpt-4o-mini";

    console.log("Sending message to OpenAI:", {
      context,
      message,
      model: useModel,
    });
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: useModel,
            messages: [
              {
                role: "system",
                content:
                  "你是一个有帮助的AI助手。你将获得用户的问题和当前网页的内容。请基于网页内容来回答用户的问题。",
              },
              {
                role: "user",
                content: `网页内容：${context}\n\n用户问题：${message}`,
              },
            ],
            temperature: 0.7,
            max_tokens: 1000,
            stream: false,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "调用 AI 服务失败");
      }

      const data = await response.json();

      const content = data.choices[0]?.message?.content;

      if (content) {
        // 发送完整响应
        port.postMessage({ content });
        // 发送完成信号
        port.postMessage({ done: true });
      } else {
        throw new Error("未收到有效响应");
      }
    } catch (error) {
      console.error("API error:", error);
      port.postMessage({ error: error.message });
    }
  } catch (error) {
    console.error("OpenAI API error:", error);
    port.postMessage({ error: `AI 服务错误: ${error.message}` });
  }
}

let sentRequests = new Set();
let subtitleContent = null;

// 监听请求完成
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.type === "xmlhttprequest") {
      try {
        if (sentRequests.has(details.url)) {
          return;
        }
        sentRequests.add(details.url);
        const response = await fetch(details.url);
        const data = await response.json();

        // 检查并获取字幕 URL
        if (data?.data?.subtitle?.subtitles?.[0]?.subtitle_url) {
          const subtitleUrl =
            "https:" + data.data.subtitle.subtitles[0].subtitle_url;
          console.log("Found subtitle URL:", subtitleUrl);

          // 获取字幕内容
          try {
            const subtitleResponse = await fetch(subtitleUrl);
            const subtitleData = await subtitleResponse.json();

            // 提取并拼接所有字幕内容
            if (subtitleData.body) {
              const subtitleText = subtitleData.body
                .map((item) => item.content)
                .join("\n");
              console.log("Background script 完整字幕内容:", subtitleText);
              subtitleContent = subtitleText;
            }
          } catch (error) {
            console.error("Error fetching subtitle:", error);
          }
        }

        console.log("Background script Bilibili API Response:", {
          url: details.url,
          data: data,
        });
      } catch (error) {
        console.error("Error fetching Bilibili API response:", error);
      }
    }
  },
  { urls: ["*://api.bilibili.com/x/player/wbi/v2*"] }
);

// 处理连接
let connections = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "llm-stream") {
    connections.add(port);

    port.onDisconnect.addListener(() => {
      connections.delete(port);
    });

    port.onMessage.addListener((request) => {
      if (request.action === "sendToLLM") {
        callOpenAI(request.message, request.context, port);
      }
    });
  }
});

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSettings") {
    chrome.runtime.openOptionsPage();
  } else if (request.action === "getSubtitle") {
    // 返回字幕内容
    sendResponse({ content: subtitleContent });
    return true; // 保持消息通道开启
  }
});

// 处理插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { action: "toggleSidebar" });
  } catch (error) {
    console.error("Error toggling sidebar:", error);
  }
});
