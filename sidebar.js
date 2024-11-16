let pageContent = '';
let currentMessageDiv = null;
let currentFullResponse = '';

// 等待 DOM 加载完成后再进行初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing...');
  
  // 检查 marked 是否加载
  console.log('Marked library status:', typeof marked !== 'undefined' ? 'loaded' : 'not loaded');
  
  // 配置 marked
  marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false
  });
  console.log('Marked options set');

  // 获取页面内容
  window.parent.postMessage({action: "getPageContent"}, '*');

  // 设置发送按钮事件
  document.getElementById('sendButton').addEventListener('click', handleSendMessage);

  // 设置总结按钮事件
  document.getElementById('summarizeBtn').addEventListener('click', () => {
    const textarea = document.getElementById('userInput');
    textarea.value = "请总结这个网页的主要内容";
    document.getElementById('sendButton').click();
  });

  // 设置设置按钮事件
  document.getElementById('settingsButton').addEventListener('click', () => {
    window.parent.postMessage({
      action: "openSettings"
    }, '*');
  });

  // 设置回车发送
  document.getElementById('userInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('sendButton').click();
    }
  });

  // 加载自定义 prompts
  const data = await chrome.storage.sync.get(['prompts']);
  if (data.prompts && data.prompts.length > 0) {
    const quickActions = document.querySelector('.quick-actions');
    
    data.prompts.forEach(prompt => {
      const btn = document.createElement('button');
      btn.className = 'quick-action-btn';
      // 截取前10个字符作为按钮文字
      btn.textContent = prompt.slice(0, 10) + (prompt.length > 10 ? '...' : '');
      btn.title = prompt; // 完整 prompt 显示在悬停提示中
      
      btn.addEventListener('click', () => {
        const textarea = document.getElementById('userInput');
        textarea.value = prompt;
        document.getElementById('sendButton').click();
      });
      
      quickActions.appendChild(btn);
    });
  }
});

// 监听消息
window.addEventListener('message', (event) => {
  console.log('Sidebar received message:', event.data);
  
  if (event.data.action === "pageContent") {
    pageContent = event.data.content;
  } else if (event.data.action === "llmResponse") {
    console.log('Received LLM response:', event.data.response);
    
    if (currentMessageDiv) {
      currentMessageDiv.classList.remove('thinking');
      
      if (event.data.response.error) {
        console.error('Error in LLM response:', event.data.response.error);
        currentMessageDiv.classList.add('error-message');
        currentMessageDiv.textContent = '抱歉，发生了错误：' + event.data.response.error;
      } else if (event.data.response.content) {
        console.log('Original response content:', event.data.response.content);
        // 测试 Markdown 解析
        const parsedContent = marked.parse(event.data.response.content);
        console.log('Parsed Markdown:', parsedContent);
        
        currentMessageDiv.innerHTML = parsedContent;
        currentMessageDiv.classList.add('markdown-content');
        
        // 检查渲染后的 DOM
        console.log('Rendered message DOM:', currentMessageDiv.innerHTML);
        console.log('Applied classes:', currentMessageDiv.className);
      }
      
      scrollToBottom();
      
      if (event.data.response.done) {
        currentMessageDiv = null;
        currentFullResponse = '';
      }
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
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}-message`;
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  if (sender === 'ai') {
    console.log('Original AI message:', message);
    const parsedContent = marked.parse(message);
    console.log('Parsed AI message:', parsedContent);
    
    contentDiv.innerHTML = parsedContent;
    contentDiv.classList.add('markdown-content');
    
    // 检查渲染后的结果
    console.log('Rendered AI message DOM:', contentDiv.innerHTML);
    console.log('AI message classes:', contentDiv.className);
  } else {
    contentDiv.textContent = message;
  }
  
  messageDiv.appendChild(contentDiv);
  chatHistory.appendChild(messageDiv);
  
  // 检查最终的 DOM 结构
  console.log('Final message DOM structure:', messageDiv.outerHTML);
  
  scrollToBottom();
  return contentDiv;
}

async function handleSendMessage() {
  const userInput = document.getElementById('userInput');
  const message = userInput.value.trim();
  
  if (!message) return;

  console.log('Sending message:', message);

  addMessageToChat('user', message);
  userInput.value = '';

  try {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai-message';
    
    currentMessageDiv = document.createElement('div');
    currentMessageDiv.className = 'message-content thinking';
    
    messageDiv.appendChild(currentMessageDiv);
    document.getElementById('chatHistory').appendChild(messageDiv);
    currentFullResponse = '';

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
} 