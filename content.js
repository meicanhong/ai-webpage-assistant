// 使用 IIFE 避免变量污染全局作用域
(function () {
  // 检查是否已经注入
  if (window.hasOwnProperty("aiChatSidebarInjected")) {
    return;
  }
  window.aiChatSidebarInjected = true;

  console.log("B站字幕助手已启动");

  let sidebar = null;
  let port = null;
  let messageSource = null;

  function connectToBackground() {
    try {
      port = chrome.runtime.connect({ name: "llm-stream" });

      port.onMessage.addListener((response) => {
        if (messageSource) {
          messageSource.postMessage(
            {
              action: "llmResponse",
              response: response,
            },
            "*"
          );
        } else {
        }
      });

      port.onDisconnect.addListener(() => {
        port = null;
        if (chrome.runtime.lastError || !chrome.runtime) {
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

      // 提取文本内容，保留段落结构
      let content = "";
      const elements = virtualContainer.querySelectorAll(
        "p, h1, h2, h3, h4, h5, h6, img, pre, code, blockquote, ul, ol, li"
      );

      elements.forEach((element) => {
        if (element.tagName.toLowerCase().startsWith("h")) {
          // 处理标题
          const level = element.tagName[1];
          const prefix = "#".repeat(parseInt(level));
          content += `\n${prefix} ${element.textContent.trim()}\n\n`;
        } else if (
          element.tagName.toLowerCase() === "pre" ||
          element.tagName.toLowerCase() === "code"
        ) {
          // 处理代码块
          content += `\n\`\`\`\n${element.textContent.trim()}\n\`\`\`\n\n`;
        } else if (element.tagName.toLowerCase() === "blockquote") {
          // 处理引用
          content += `\n> ${element.textContent.trim()}\n\n`;
        } else if (
          element.tagName.toLowerCase() === "ul" ||
          element.tagName.toLowerCase() === "ol"
        ) {
          // 处理列表（只处理直接子元素）
          const items = element.children;
          Array.from(items).forEach((item) => {
            if (item.tagName.toLowerCase() === "li") {
              content += `\n- ${item.textContent.trim()}\n`;
            }
          });
          content += "\n";
        } else {
          // 处理普通段落
          const text = element.textContent.trim();
          if (text) {
            content += `\n${text}\n\n`;
          }
        }
      });

      // 清理文本
      content = content
        .replace(/\n{3,}/g, "\n\n") // 将多个换行符替换为两个
        .trim();

      // 移除虚拟容器
      virtualContainer.remove();

      return content;
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
      if (sidebar) {
        if (sidebar.style.right === "0px") {
          sidebar.style.right = "-400px";
        } else {
          sidebar.style.right = "0px";
        }
      } else {
        console.error("Sidebar element not found");
      }
    } else if (event.data.action === "sendToLLM") {
      try {
        messageSource = event.source;

        if (!port) {
          port = connectToBackground();
        }

        if (!port) {
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
    } else if (event.data.action === "reloadExtension") {
      // 重新加载扩展
      chrome.runtime.reload();
      // 重新创建侧边栏
      if (sidebar) {
        sidebar.remove();
        sidebar = null;
      }
      sidebar = createSidebar();
      if (sidebar) {
        sidebar.style.right = "0px";
      }
    } else if (event.data.action === "getSubtitle") {
      try {
        // 从 background 获取字幕内容
        chrome.runtime.sendMessage({ action: "getSubtitle" }, (response) => {
          if (response && response.content) {
            event.source.postMessage(
              {
                action: "subtitleContent",
                content: response.content,
              },
              "*"
            );
          } else {
            event.source.postMessage(
              {
                action: "subtitleContent",
                error: "未找到字幕内容，请确保视频有字幕并刷新页面",
              },
              "*"
            );
          }
        });
      } catch (error) {
        event.source.postMessage(
          {
            action: "subtitleContent",
            error: "获取字幕失败: " + error.message,
          },
          "*"
        );
      }
    }
  });
})();
