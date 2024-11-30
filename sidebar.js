let pageContent = "";
let currentMessageDiv = null;
let currentFullResponse = "";

// 添加聊天历史相关函数
async function saveChatHistory(message) {
  try {
    const data = await chrome.storage.local.get(["chatHistory"]);
    const chatHistory = data.chatHistory || [];

    // 确保消息有所有必要的字段
    message.timestamp = message.timestamp || new Date().toISOString();

    chatHistory.push(message);

    // 限制历史记录数量，保留最近的100条
    if (chatHistory.length > 100) {
      chatHistory.shift();
    }

    await chrome.storage.local.set({ chatHistory });
  } catch (error) {
    // 如果是扩展上下文失效的错误，尝试重新连接
    if (error.message.includes("Extension context invalidated")) {
      console.warn("Extension context invalidated, attempting to reconnect...");
      // 通知父窗口重新加载扩展
      window.parent.postMessage(
        {
          action: "reloadExtension",
        },
        "*"
      );
    } else {
      console.error("Error saving chat history:", error);
    }
  }
}

async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get(["chatHistory"]);
    const chatHistory = data.chatHistory || [];

    // 按时间戳排序
    chatHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // 清空当前聊天记录
    document.getElementById("chatHistory").innerHTML = "";

    // 显示所有消息
    chatHistory.forEach((message) => {
      if (message.role === "user") {
        addMessageToChat("user", message.content);
      } else if (message.role === "assistant") {
        addMessageToChat("ai", message.content);
      }
    });
  } catch (error) {
    console.error("Error loading chat history:", error);
  }
}

// 等待 DOM 加载完成后再进行初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 配置 marked
  marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false,
  });

  // 获取页面内容
  window.parent.postMessage({ action: "getPageContent" }, "*");

  // 设置发送按钮事件
  document
    .getElementById("sendButton")
    .addEventListener("click", handleSendMessage);

  // 设置总结按钮事件
  document.getElementById("summarizeBtn").addEventListener("click", () => {
    const textarea = document.getElementById("userInput");
    textarea.value = `你是一个专业的文本清洁专家，请按照以下步骤处理文章：

1. 内容净化
   - 删除所有口语化、冗余的表达
   - 移除广告性质的内容
   - 去除与主题无关的描述和段落
   - 保留文章的核心信息和主题相关的内容

2. 输出要求
   - 直接返回处理后的干净文本
   - 保持原文的基本结构和逻辑
   - 不需要添加任何总结或额外解释
   - 重要内容用加粗格式
   - 返回中文

以下是需要处理的文本：
${pageContent}`;
    document.getElementById("sendButton").click();
  });

  // 设置设置按钮事件
  document.getElementById("settingsButton").addEventListener("click", () => {
    window.parent.postMessage(
      {
        action: "openSettings",
      },
      "*"
    );
  });

  // 设置回车发送
  document.getElementById("userInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("sendButton").click();
    }
  });

  // 加载自定义 prompts
  const data = await chrome.storage.sync.get(["prompts"]);
  if (data.prompts && data.prompts.length > 0) {
    const quickActions = document.querySelector(".quick-actions");

    data.prompts.forEach((prompt) => {
      const btn = document.createElement("button");
      btn.className = "quick-action-btn";
      // 截取前10个字符作为按钮文字
      btn.textContent = prompt.slice(0, 10) + (prompt.length > 10 ? "..." : "");
      btn.title = prompt; // 完整 prompt 显示在悬停提示中

      btn.addEventListener("click", () => {
        const textarea = document.getElementById("userInput");
        textarea.value = prompt;
        document.getElementById("sendButton").click();
      });

      quickActions.appendChild(btn);
    });
  }

  // 动态调整聊天历史区域的内边距
  function adjustChatHistoryPadding() {
    const inputArea = document.querySelector(".input-area");
    const chatHistory = document.querySelector(".chat-history");
    if (!inputArea || !chatHistory) return;

    const inputHeight = inputArea.offsetHeight;
    chatHistory.style.paddingBottom = `${inputHeight + 20}px`;
    scrollToBottom(); // 调整后自动滚动到底部
  }

  // 监听输入框高度变化
  const resizeObserver = new ResizeObserver(adjustChatHistoryPadding);
  resizeObserver.observe(document.querySelector(".input-area"));

  // 监听 textarea 的输入事件
  document.querySelector("textarea").addEventListener("input", () => {
    requestAnimationFrame(adjustChatHistoryPadding); // 使用 requestAnimationFrame 优化性能
  });

  // 初始调整
  adjustChatHistoryPadding();

  // 在窗口大小改变时也调整
  window.addEventListener("resize", () => {
    requestAnimationFrame(adjustChatHistoryPadding);
  });

  // 添加清除按钮事件
  document.getElementById("clearButton").addEventListener("click", async () => {
    try {
      // 直接清除所有聊天记录
      await chrome.storage.local.set({ chatHistory: [] });

      // 清空当前显示的聊天记录
      document.getElementById("chatHistory").innerHTML = "";

      // 显示清除成功的提示
      const messageDiv = document.createElement("div");
      messageDiv.className = "message system-message";
      messageDiv.textContent = "已清除聊天记录";
      document.getElementById("chatHistory").appendChild(messageDiv);

      // 1秒后移除提示
      setTimeout(() => {
        messageDiv.remove();
      }, 1000);
    } catch (error) {
      console.error("Error clearing chat history:", error);
      // 显示错误提示
      const errorDiv = document.createElement("div");
      errorDiv.className = "message error-message";
      errorDiv.textContent = "清除聊天记录时出错";
      document.getElementById("chatHistory").appendChild(errorDiv);
    }
  });

  // 添加系统消息样式
  const style = document.createElement("style");
  style.textContent = `
    .temp-message {
      animation: fadeIn 0.3s ease-in-out;
      opacity: 0.8;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 0.8; }
    }
  `;
  document.head.appendChild(style);

  // 添加折叠按钮事件
  document.getElementById("collapseButton").addEventListener("click", () => {
    window.parent.postMessage(
      {
        action: "toggleSidebar",
      },
      "*"
    );
  });

  // 检查是否在 B站 页面
  window.parent.postMessage({ action: "getCurrentUrl" }, "*");

  // 监听 URL 响应
  window.addEventListener("message", function handleUrlResponse(event) {
    if (event.data.action === "currentUrl") {
      console.log("Received URL:", event.data.url);
      const subtitleBtn = document.getElementById("subtitleBtn");
      if (subtitleBtn) {
        // 只在 B站 视频页面显示字幕按钮
        if (event.data.url.includes("bilibili.com/video/")) {
          console.log("Showing subtitle button");
          subtitleBtn.style.display = "inline-block";
          // 移除现有的事件监听器（如果有的话）
          subtitleBtn.removeEventListener("click", fetchSubtitle);
          // 添加新的点击事件监听
          subtitleBtn.addEventListener("click", fetchSubtitle);
        } else {
          console.log("Hiding subtitle button");
          subtitleBtn.style.display = "none";
        }
      }
      window.removeEventListener("message", handleUrlResponse);
    } else if (event.data.action === "subtitleContent") {
      if (event.data.error) {
        appendMessage("system", "获取字幕失败: " + event.data.error);
      } else if (event.data.content) {
        appendMessage("system", "字幕内容:\n\n" + event.data.content);
      }
    }
  });
});

// 修改消息监听器
window.addEventListener("message", (event) => {
  if (event.data.action === "pageContent") {
    pageContent = event.data.content;
    // 加载历史记录
    loadChatHistory();
  } else if (event.data.action === "llmResponse") {
    if (currentMessageDiv) {
      currentMessageDiv.classList.remove("thinking");

      if (event.data.response.error) {
        console.error("Error in LLM response:", event.data.response.error);
        currentMessageDiv.classList.add("error-message");
        currentMessageDiv.textContent =
          "抱歉，发生了错误：" + event.data.response.error;
      } else if (event.data.response.content) {
        const parsedContent = marked.parse(event.data.response.content);

        currentMessageDiv.innerHTML = parsedContent;
        currentMessageDiv.classList.add("markdown-content");

        // 修改这里：立即保存 AI 回复，不要等待 done 信号
        saveChatHistory({
          role: "assistant",
          content: event.data.response.content,
          timestamp: new Date().toISOString(),
        })
          .then(() => {})
          .catch((error) => {
            console.error("Error saving AI response:", error);
          });
      }

      scrollToBottom();

      if (event.data.response.done) {
        currentMessageDiv = null;
        currentFullResponse = "";
      }
    }
  } else if (event.data.action === "subtitleContent") {
    console.log("字幕内容:", event.data);
    if (event.data.error) {
      appendMessage("system", "获取字幕失败: " + event.data.error);
    } else if (event.data.content) {
      appendMessage("system", "字幕内容:\n\n" + event.data.content);
    }
  } else if (event.data.action === "currentUrl") {
    const videoUrl = event.data.url;
    if (!videoUrl.includes("bilibili.com/video/")) {
      appendMessage("system", "请在 B站 视频页面使用此功能");
      return;
    }
    console.log("当前视频 URL:", videoUrl);
  }
});

function scrollToBottom() {
  requestAnimationFrame(() => {
    const chatHistory = document.getElementById("chatHistory");
    chatHistory.scrollTop = chatHistory.scrollHeight;
  });
}

function addMessageToChat(sender, message) {
  const chatHistory = document.getElementById("chatHistory");

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}-message`;

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (sender === "ai") {
    const parsedContent = marked.parse(message);
    contentDiv.innerHTML = parsedContent;
    contentDiv.classList.add("markdown-content");
  } else {
    contentDiv.textContent = message;
  }

  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);

  scrollToBottom();
  return contentDiv;
}

// 修改消息发送函数
async function handleSendMessage() {
  const userInput = document.getElementById("userInput");
  const message = userInput.value.trim();

  if (!message) return;

  try {
    // 保存用户消息
    await saveChatHistory({
      role: "user",
      content: message,
    });

    addMessageToChat("user", message);
    userInput.value = "";

    const messageDiv = document.createElement("div");
    messageDiv.className = "message ai-message";

    currentMessageDiv = document.createElement("div");
    currentMessageDiv.className = "message-content thinking";

    messageDiv.appendChild(currentMessageDiv);
    document.getElementById("chatHistory").appendChild(messageDiv);
    currentFullResponse = "";

    window.parent.postMessage(
      {
        action: "sendToLLM",
        message: message,
        context: pageContent,
      },
      "*"
    );
  } catch (error) {
    console.error("Error in handleSendMessage:", error);
    const errorDiv = addMessageToChat(
      "ai",
      "抱歉，发生了错误：" + error.message
    );
    errorDiv.classList.add("error-message");
  }
}

// 添加临时消息到聊天记录
function appendTempMessage(type, message) {
  const chatHistory = document.getElementById("chatHistory");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}-message temp-message`;

  if (type === "system") {
    const pre = document.createElement("pre");
    pre.textContent = message;
    messageDiv.appendChild(pre);
  } else {
    messageDiv.textContent = message;
  }

  chatHistory.appendChild(messageDiv);
  scrollToBottom();
  return messageDiv; // 返回消息元素以便后续移除
}

// 获取字幕内容
async function fetchSubtitle() {
  console.log("fetchSubtitle called");
  try {
    const loadingMsg = appendTempMessage("system", "正在获取字幕...");
    window.parent.postMessage(
      {
        action: "getSubtitle",
      },
      "*"
    );

    // 监听字幕响应
    window.addEventListener("message", function handleSubtitleResponse(event) {
      if (event.data.action === "subtitleContent") {
        loadingMsg.remove();
        window.removeEventListener("message", handleSubtitleResponse);
      }
    });
  } catch (error) {
    console.error("Error fetching subtitle:", error);
    appendMessage("system", "获取字幕失败: " + error.message);
  }
}

// 添加系统消息到聊天记录
function appendMessage(type, message, temporary = false) {
  const chatHistory = document.getElementById("chatHistory");
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${type}-message${
    temporary ? " temp-message" : ""
  }`;

  if (type === "system") {
    const pre = document.createElement("pre");
    pre.textContent = message;
    messageDiv.appendChild(pre);
  } else {
    messageDiv.textContent = message;
  }

  chatHistory.appendChild(messageDiv);
  scrollToBottom();

  if (temporary) {
    return messageDiv;
  }
}
