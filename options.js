document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 加载保存的设置
    const data = await chrome.storage.sync.get(['apiKey', 'model']);
    
    const apiKeyInput = document.getElementById('apiKey');
    const modelSelect = document.getElementById('model');
    
    if (apiKeyInput && data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
    
    // 设置默认模型为 gpt-4o-mini
    if (modelSelect) {
      modelSelect.value = data.model || 'gpt-4o-mini';
    }

    // 如果是首次加载且没有保存过设置，自动保存默认模型
    if (!data.model) {
      await chrome.storage.sync.set({ model: 'gpt-4o-mini' });
    }

    // 保存设置
    document.getElementById('saveButton').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKey').value.trim();
      const model = document.getElementById('model').value;

      if (!apiKey) {
        showStatus('请输入 API Key', 'error');
        return;
      }

      try {
        // 验证 API Key
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{role: "user", content: "Hello"}],
            max_tokens: 5
          })
        });

        if (!response.ok) {
          throw new Error('API Key 无效');
        }

        // 保存设置
        await chrome.storage.sync.set({ apiKey, model });
        showStatus('设置已保存', 'success');
      } catch (error) {
        showStatus(error.message, 'error');
      }
    });
  } catch (error) {
    console.error('Error initializing options:', error);
    showStatus('加载设置时出错', 'error');
  }
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
} 