// 使用 IIFE 避免变量污染全局作用域
(function () {
  // 检查是否已经注入
  if (window.hasOwnProperty("aiChatSidebarInjected")) {
    return;
  }
  window.aiChatSidebarInjected = true;

  let sidebar = null;
  let port = null;
  let messageSource = null;

  function connectToBackground() {
    try {
      console.log("Connecting to background...");
      port = chrome.runtime.connect({ name: "llm-stream" });

      port.onMessage.addListener((response) => {
        console.log("Received response from background:", response);
        if (messageSource) {
          console.log("Forwarding response to iframe:", response);
          messageSource.postMessage(
            {
              action: "llmResponse",
              response: response,
            },
            "*"
          );
        } else {
          console.log("No message source available");
        }
      });

      port.onDisconnect.addListener(() => {
        console.log("Port disconnected");
        port = null;
        if (chrome.runtime.lastError || !chrome.runtime) {
          console.log("Extension context invalidated, reconnecting...");
          setTimeout(connectToBackground, 1000);
        }
      });

      return port;
    } catch (error) {
      console.error("Error connecting to background:", error);
      return null;
    }
  }

  function createSidebar() {
    try {
      // 创建一个覆盖层容器
      const container = document.createElement("div");
      container.id = "ai-chat-sidebar-container";
      container.style.cssText = `
        position: fixed;
        top: 0;
        right: -400px;
        width: 400px;
        height: 100vh;
        z-index: 2147483647;
        transition: right 0.3s;
        background: white;
        box-shadow: -2px 0 5px rgba(0,0,0,0.2);
        border: none;
        isolation: isolate;
      `;

      // 创建 iframe 并添加样式隔离
      const sidebarElement = document.createElement("iframe");
      sidebarElement.id = "ai-chat-sidebar";
      sidebarElement.src = chrome.runtime.getURL("sidebar.html");
      sidebarElement.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
        background: white;
        isolation: isolate;
      `;

      container.appendChild(sidebarElement);
      document.documentElement.appendChild(container);
      return container;
    } catch (error) {
      console.error("Error creating sidebar:", error);
      return null;
    }
  }

  function getPageContent() {
    try {
      // 创建一个虚拟的容器来存放克隆的内容
      const virtualContainer = document.createElement("div");
      virtualContainer.style.display = "none";

      // 克隆 body 内容
      const clone = document.body.cloneNode(true);
      virtualContainer.appendChild(clone);

      // 移除不需要的元素
      const selectorsToRemove = [
        "script",
        "style",
        "iframe",
        "noscript",
        "header",
        "footer",
        "nav",
        "#header",
        "#footer",
        ".header",
        ".footer",
        ".navigation",
        ".nav",
        ".sidebar",
        ".menu",
        ".comments",
        ".advertisement",
        ".ads",
        '[role="complementary"]',
        '[role="banner"]',
        '[role="navigation"]',
        "#ai-chat-sidebar-container",
      ];

      selectorsToRemove.forEach((selector) => {
        const elements = virtualContainer.querySelectorAll(selector);
        elements.forEach((element) => element.remove());
      });

      // 提取文本内容
      const content = virtualContainer.textContent || "";

      // 清理文本
      const cleanContent = content.replace(/\s+/g, " ").trim();

      // 移除虚拟容器
      virtualContainer.remove();

      return cleanContent;
    } catch (error) {
      console.error("Error getting page content:", error);
      return document.body.innerText || "";
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleSidebar") {
      try {
        if (!sidebar) {
          sidebar = createSidebar();
        }

        if (sidebar) {
          if (sidebar.style.right === "0px") {
            sidebar.style.right = "-400px";
          } else {
            sidebar.style.right = "0px";
          }
        }
      } catch (error) {
        console.error("Error toggling sidebar:", error);
      }
    }
  });

  // 监听来自 iframe 的消息
  window.addEventListener("message", (event) => {
    if (event.data.action === "getPageContent") {
      const content = getPageContent();
      try {
        event.source.postMessage(
          {
            action: "pageContent",
            content: content,
          },
          "*"
        );
      } catch (error) {
        console.error("Error sending page content:", error);
      }
    } else if (event.data.action === "getCurrentUrl") {
      // 返回当前页面的 URL
      event.source.postMessage(
        {
          action: "currentUrl",
          url: window.location.href,
        },
        "*"
      );
    } else if (event.data.action === "openSettings") {
      chrome.runtime.sendMessage({ action: "openSettings" });
    } else if (event.data.action === "toggleSidebar") {
      console.log("Received toggleSidebar action");
      if (sidebar) {
        console.log("Current sidebar right position:", sidebar.style.right);
        if (sidebar.style.right === "0px") {
          sidebar.style.right = "-400px";
        } else {
          sidebar.style.right = "0px";
        }
        console.log("New sidebar right position:", sidebar.style.right);
      } else {
        console.error("Sidebar element not found");
      }
    } else if (event.data.action === "sendToLLM") {
      try {
        console.log("Received sendToLLM request:", event.data);

        messageSource = event.source;
        console.log("Message source saved:", !!messageSource);

        if (!port) {
          console.log("Creating new port connection");
          port = connectToBackground();
        }

        if (!port) {
          console.log("Failed to create port connection");
          messageSource.postMessage(
            {
              action: "llmResponse",
              response: { error: "无法连接到扩展后台" },
            },
            "*"
          );
          return;
        }

        port.postMessage({
          action: "sendToLLM",
          message: event.data.message,
          context: event.data.context,
        });
      } catch (error) {
        console.error("Error in sendToLLM:", error);
        event.source.postMessage(
          {
            action: "llmResponse",
            response: { error: error.message },
          },
          "*"
        );
      }
    }
  });
})();
