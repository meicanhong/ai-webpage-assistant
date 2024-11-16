let pageContent = '';
let currentMessageDiv = null;
let currentFullResponse = '';

// 添加聊天历史相关函数
async function saveChatHistory(message) {
  try {
    console.log('Saving message to history:', message);
    const data = await chrome.storage.local.get(['chatHistory']);
    const chatHistory = data.chatHistory || [];
    
    // 确保消息有所有必要的字段
    message.timestamp = message.timestamp || new Date().toISOString();
    
    chatHistory.push(message);
    
    // 限制历史记录数量，保留最近的100条
    if (chatHistory.length > 100) {
      chatHistory.shift();
    }
    
    await chrome.storage.local.set({ chatHistory });
    console.log('Chat history saved, total messages:', chatHistory.length);
  } catch (error) {
    console.error('Error saving chat history:', error);
    throw error;  // 重新抛出错误以便调用者处理
  }
}

async function loadChatHistory() {
  try {
    const data = await chrome.storage.local.get(['chatHistory']);
    const chatHistory = data.chatHistory || [];
    
    console.log('Loading chat history, total messages:', chatHistory.length);
    
    // 按时间戳排序
    chatHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // 清空当前聊天记录
    document.getElementById('chatHistory').innerHTML = '';
    
    // 显示所有消息
    chatHistory.forEach(message => {
      console.log('Processing message:', message);
      if (message.role === 'user') {
        addMessageToChat('user', message.content);
      } else if (message.role === 'assistant') {
        addMessageToChat('ai', message.content);
      }
    });
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}

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
    textarea.value = "请以 Markdown 格式总结这个网页的主要内容，包括：\n" +
      "1. 用一级标题概括网页主题\n" +
      "2. 用无序列表列出主要要点\n" +
      "3. 如果有重要数据，用引用格式标注\n" +
      "4. 如果有代码示例，使用代码块格式\n" +
      "请确保返回格式化的 Markdown 文本。";
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

  // 动态调整聊天历史区域的内边距
  function adjustChatHistoryPadding() {
    const inputArea = document.querySelector('.input-area');
    const chatHistory = document.querySelector('.chat-history');
    if (!inputArea || !chatHistory) return;

    const inputHeight = inputArea.offsetHeight;
    chatHistory.style.paddingBottom = `${inputHeight + 20}px`;
    scrollToBottom();  // 调整后自动滚动到底部
  }

  // 监听输入框高度变化
  const resizeObserver = new ResizeObserver(adjustChatHistoryPadding);
  resizeObserver.observe(document.querySelector('.input-area'));

  // 监听 textarea 的输入事件
  document.querySelector('textarea').addEventListener('input', () => {
    requestAnimationFrame(adjustChatHistoryPadding);  // 使用 requestAnimationFrame 优化性能
  });

  // 初始调整
  adjustChatHistoryPadding();

  // 在窗口大小改变时也调整
  window.addEventListener('resize', () => {
    requestAnimationFrame(adjustChatHistoryPadding);
  });

  // 添加清除按钮事件
  document.getElementById('clearButton').addEventListener('click', async () => {
    try {
      // 获取当前日期的开始时间
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 获取所有聊天记录
      const data = await chrome.storage.local.get(['chatHistory']);
      const chatHistory = data.chatHistory || [];

      // 过滤掉今天的聊天记录
      const filteredHistory = chatHistory.filter(message => {
        const messageDate = new Date(message.timestamp);
        return messageDate < today;
      });

      // 保存过滤后的记录
      await chrome.storage.local.set({ chatHistory: filteredHistory });

      // 清空当前显示的聊天记录
      document.getElementById('chatHistory').innerHTML = '';

      // 重新加载过滤后的历史记录
      loadChatHistory();

      // 显示清除成功的提示
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message system-message';
      messageDiv.textContent = '已清除今天的聊天记录';
      document.getElementById('chatHistory').appendChild(messageDiv);

      // 3秒后移除提示
      setTimeout(() => {
        messageDiv.remove();
      }, 3000);

    } catch (error) {
      console.error('Error clearing chat history:', error);
      // 显示错误提示
      const errorDiv = document.createElement('div');
      errorDiv.className = 'message error-message';
      errorDiv.textContent = '清除聊天记录时出错';
      document.getElementById('chatHistory').appendChild(errorDiv);
    }
  });

  // 添加系统消息样式
  const style = document.createElement('style');
  style.textContent = `
    .system-message {
      text-align: center;
      color: #666;
      font-size: 12px;
      margin: 8px 0;
      padding: 4px 8px;
      background: #f8f9fa;
      border-radius: 4px;
      animation: fadeIn 0.3s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
});

// 修改消息监听器
window.addEventListener('message', (event) => {
  console.log('Sidebar received message:', event.data);
  
  if (event.data.action === "pageContent") {
    pageContent = event.data.content;
    // 加载历史记录
    loadChatHistory();
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
        const parsedContent = marked.parse(event.data.response.content);
        
        currentMessageDiv.innerHTML = parsedContent;
        currentMessageDiv.classList.add('markdown-content');
        
        // 修改这里：立即保存 AI 回复，不要等待 done 信号
        saveChatHistory({
          role: 'assistant',
          content: event.data.response.content,
          timestamp: new Date().toISOString()
        }).then(() => {
          console.log('AI response saved to history');
        }).catch(error => {
          console.error('Error saving AI response:', error);
        });
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
  requestAnimationFrame(() => {
    const chatHistory = document.getElementById('chatHistory');
    chatHistory.scrollTop = chatHistory.scrollHeight;
  });
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
  const userInput = document.getElementById('userInput');
  const message = userInput.value.trim();
  
  if (!message) return;

  console.log('Sending message:', message);

  // 保存用户消息
  await saveChatHistory({
    role: 'user',
    content: message
  });

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