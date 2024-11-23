async function callOpenAI(message, context, port) {
  try {
    console.log("Starting callOpenAI...");
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
    console.log("Using model:", useModel);

    console.log("Calling OpenAI API...");
    try {
      // 先尝试非流式请求
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

      console.log("API Response status:", response.status);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "调用 AI 服务失败");
      }

      const data = await response.json();
      console.log("API Response data:", data);

      const content = data.choices[0]?.message?.content;

      if (content) {
        console.log("Sending content to port:", content);
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

// 处理连接
let connections = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "llm-stream") {
    console.log("New connection established");
    connections.add(port);

    port.onDisconnect.addListener(() => {
      console.log("Connection disconnected");
      connections.delete(port);
    });

    port.onMessage.addListener((request) => {
      console.log("Received message in background:", request);
      if (request.action === "sendToLLM") {
        callOpenAI(request.message, request.context, port);
      }
    });
  }
});

// 处理其他消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSettings") {
    chrome.runtime.openOptionsPage();
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
