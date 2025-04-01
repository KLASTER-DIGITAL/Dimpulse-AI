import { useEffect, useState, useRef } from "react";

interface MarkdownRendererProps {
  content: string;
}

// This is a markdown renderer with support for embedded HTML and scripts
const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const [formattedText, setFormattedText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Function to safely execute scripts in the content
  const executeScripts = () => {
    if (!containerRef.current) return;
    
    // Find all script tags in the container
    const scripts = containerRef.current.querySelectorAll('script');
    
    if (scripts.length === 0) {
      // If no scripts were found but we're expecting one (for Cal), add it manually
      if (content.includes('Cal(') && content.includes('function')) {
        console.log("No script tags found but Cal detected - script will be injected via HTML");
      }
    } else {
      console.log(`Found ${scripts.length} script tags to execute`);
      
      // Handle standard script tags
      scripts.forEach((oldScript, index) => {
        try {
          // Create a new script element
          const newScript = document.createElement('script');
          
          // Copy all attributes from the old script to the new one
          Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });
          
          // Copy the content of the script
          newScript.textContent = oldScript.textContent;
          
          // If this is an external script (with src), handle loading
          if (oldScript.src) {
            console.log(`Processing external script ${index + 1}: ${oldScript.src}`);
          } else {
            console.log(`Processing inline script ${index +.1}, length: ${oldScript.textContent?.length || 0} chars`);
          }
          
          // Replace the old script with the new one to execute it
          if (oldScript.parentNode) {
            oldScript.parentNode.replaceChild(newScript, oldScript);
          } else {
            console.warn("Script has no parent node, appending to document body");
            document.body.appendChild(newScript);
          }
        } catch (error) {
          console.error(`Error executing script ${index}:`, error);
        }
      });
    }
  };

  useEffect(() => {
    // Function to convert markdown to HTML or preserve existing HTML
    const processContent = (content: string) => {
      // Special case for HTML with Cal.com embed code
      if (content.includes('<!-- Cal inline embed code begins -->')) {
        console.log("Cal.com embed with HTML comment detected, preserving as is");
        return content;
      }
      
      // Special case for Cal.com calendar code which doesn't have HTML tags but should be handled as code
      if (content.includes('Cal(') && content.includes('function')) {
        // For Cal.com integration, use the complete code directly
        console.log("Cal.com integration detected, using complete HTML");
        return `
          <div style="width:100%;height:auto;overflow:hidden;position:relative;" id="my-cal-inline"></div>
          <script type="text/javascript">
            (function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if(typeof namespace === "string"){cal.ns[namespace] = cal.ns[namespace] || api;p(cal.ns[namespace], ar);p(cal, ["initNamespace", namespace]);} else p(cal, ar); return;} p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
            Cal("init", "30min", {origin:"https://cal.com"});

            Cal.ns["30min"]("inline", {
              elementOrSelector:"#my-cal-inline",
              config: {"layout":"month_view","theme":"dark"},
              calLink: "dimpulse/30min",
            });

            Cal.ns["30min"]("ui", {"theme":"dark","hideEventTypeDetails":false,"layout":"month_view"});
            
            // Настраиваем стиль iframe после загрузки
            setTimeout(function() {
              const calIframe = document.querySelector('.cal-embed');
              if (calIframe) {
                calIframe.style.width = '100%';
                // Динамически рассчитываем высоту для избежания скролла
                const calHeight = window.innerHeight - 100; // Вычитаем отступы
                calIframe.style.height = calHeight + 'px';
                calIframe.style.border = 'none';
                calIframe.style.overflow = 'hidden';
                
                // Добавляем обработчик размера окна
                window.addEventListener('resize', function() {
                  const newHeight = window.innerHeight - 100;
                  calIframe.style.height = newHeight + 'px';
                });
              }
            }, 1000);
          </script>
        `;
      }
    
      // Check if the content contains HTML with iframes or scripts
      const containsComplexHTML = /<\/?(?:iframe|script|div)[\s\S]*?>/i.test(content);
      
      // If content already contains complex HTML elements, preserve it entirely
      if (containsComplexHTML) {
        console.log("Content contains complex HTML, preserving as is");
        return content;
      }
      
      // Otherwise process as markdown
      let html = content;

      // Headers
      html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-medium mt-4 mb-2">$1</h3>');
      html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-medium mt-4 mb-2">$1</h2>');
      html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-medium mt-4 mb-2">$1</h1>');

      // Bold
      html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
      html = html.replace(/__(.*?)__/gim, '<strong>$1</strong>');

      // Italic
      html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
      html = html.replace(/_(.*?)_/gim, '<em>$1</em>');

      // Code blocks
      html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');

      // Inline code
      html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

      // Lists
      // Unordered lists
      html = html.replace(/^\* (.*$)/gim, '<ul><li>$1</li></ul>');
      html = html.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
      // Combine consecutive list items
      html = html.replace(/<\/ul>\s*<ul>/gim, '');

      // Ordered lists
      html = html.replace(/^\d+\. (.*$)/gim, '<ol><li>$1</li></ol>');
      // Combine consecutive list items
      html = html.replace(/<\/ol>\s*<ol>/gim, '');

      // Paragraphs
      html = html.replace(/^\s*(\n)?(.+)/gim, function(m) {
        if (m.match(/^<\/?(ul|ol|li|h|p|bl|code|iframe|script|div)/)) return m;
        return '<p>' + m + '</p>';
      });

      // Remove extra paragraphs around HTML elements
      html = html.replace(/<p><(ul|ol|li|h1|h2|h3|pre|iframe|script|div)/gim, '<$1');
      html = html.replace(/<\/(ul|ol|li|h1|h2|h3|pre|iframe|script|div)><\/p>/gim, '</$1>');

      // Fix newlines
      html = html.replace(/\n$/gim, '<br/>');

      return html;
    };

    setFormattedText(processContent(content));
  }, [content]);

  // Execute scripts when the content changes or after rendering
  useEffect(() => {
    // Add a timeout to ensure DOM has fully updated before executing scripts
    const timer = setTimeout(() => {
      console.log("Executing scripts with delay");
      executeScripts();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formattedText]);

  return (
    <div 
      ref={containerRef}
      className="text-base whitespace-pre-wrap markdown-content"
      dangerouslySetInnerHTML={{ __html: formattedText }}
    />
  );
};

export default MarkdownRenderer;
