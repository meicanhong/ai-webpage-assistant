let pageContent = '';
let currentMessageDiv = null;
let currentFullResponse = '';

// 获取页面内容
window.parent.postMessage({action: "getPageContent"}, '*');

// 监听来自content script的消息
window.addEventListener('message', (event) => {
  console.log('Sidebar received message:', event.data);
  
  if (event.data.action === "pageContent") {
    pageContent = event.data.content;
  } else if (event.data.action === "llmResponse") {
    console.log('Received LLM response:', event.data.response);
    
    // 直接处理响应内容
    if (currentMessageDiv) {
      currentMessageDiv.classList.remove('thinking');
      
      if (event.data.response.error) {
        currentMessageDiv.classList.add('error-message');
        currentMessageDiv.textContent = '抱歉，发生了错误：' + event.data.response.error;
      } else if (event.data.response.content) {
        currentMessageDiv.textContent = event.data.response.content;
      }
      
      scrollToBottom();
      
      if (event.data.response.done) {
        currentMessageDiv = null;
        currentFullResponse = '';
      }
    } else {
      console.log('No current message div available');
    }
  }
});

function scrollToBottom() {
  const chatHistory = document.getElementById('chatHistory');
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function addMessageToChat(sender, message) {
  console.log('Adding message:', { sender, message });
  const chatHistory = document.getElementById('chatHistory');
  
  // 创建消息容器
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  // 创建消息内容容器
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = message;
  
  // 将内容容器添加到消息容器中
  messageDiv.appendChild(contentDiv);
  
  chatHistory.appendChild(messageDiv);
  scrollToBottom();
  return contentDiv;
}

document.getElementById('sendButton').addEventListener('click', async () => {
  const userInput = document.getElementById('userInput');
  const message = userInput.value.trim();
  
  if (!message) return;

  console.log('Sending message:', message);

  // 加用户消息到聊天历史
  addMessageToChat('user', message);
  
  // 立即清空输入框
  userInput.value = '';

  try {
    // 创建AI消息容器
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    
    // 创建消息内容容器
    currentMessageDiv = document.createElement('div');
    currentMessageDiv.className = 'message-content thinking';
    
    messageDiv.appendChild(currentMessageDiv);
    document.getElementById('chatHistory').appendChild(messageDiv);
    currentFullResponse = '';

    console.log('Sending message to content script:', {
      message,
      context: pageContent
    });

    // 发送消息给content script
    window.parent.postMessage({
      action: "sendToLLM",
      message: message,
      context: pageContent
    }, '*');

  } catch (error) {
    console.error('Error sending message:', error);
    const errorDiv = addMessageToChat('ai', '抱歉，发生了错误：' + error.message);
    errorDiv.classList.add('error-message');
  }
});

// 确保DOM加载完成后再添加事件监听
document.addEventListener('DOMContentLoaded', () => {
  console.log('Sidebar DOM loaded');
  
  const sendButton = document.getElementById('sendButton');
  const userInput = document.getElementById('userInput');
  const settingsButton = document.getElementById('settingsButton');

  if (sendButton && userInput) {
    // 添加回车发送功能
    userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
      }
    });
  }

  // 添加设置按钮点击事件
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      // 通过 content script 打开设置页面
      window.parent.postMessage({
        action: "openSettings"
      }, '*');
    });
  }

  // 修改总结网页按钮点击事件
  document.getElementById('summarizeBtn').addEventListener('click', () => {
    const textarea = document.getElementById('userInput');
    textarea.value = "请总结这个网页的主要内容";
    // 直接触发发送按钮点击
    document.getElementById('sendButton').click();
  });
});

// 添加设置按钮点击事件
document.getElementById('settingsButton').addEventListener('click', function() {
    // 打开选项页面
    chrome.runtime.openOptionsPage();
}); 