import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { SupportedLanguage, executeCode, LANGUAGE_IDS } from '../services/judge0Service';
import { toast } from './Toaster';

interface CodeEditorProps {
  language?: SupportedLanguage;
  initialCode?: string;
  taskDescription?: string;
  initialStdin?: string;
  onCodeChange?: (code: string) => void;
  onLanguageChange?: (language: SupportedLanguage) => void;
  onStdinChange?: (stdin: string) => void;
  onCodeSubmit?: (code: string, language: SupportedLanguage, output?: string, stdin?: string, error?: string) => void;
  readOnly?: boolean;
  height?: string;
}

const DEFAULT_CODE: Record<SupportedLanguage, string> = {
  javascript: `// Write your solution here
function solution() {
    // Your code
    return "Hello, World!";
}

console.log(solution());`,
  python: `# Write your solution here
def solution():
    # Your code
    return "Hello, World!"

print(solution())`,
  java: `// Write your solution here
public class Solution {
    public static void main(String[] args) {
        // Your code
        System.out.println("Hello, World!");
    }
}`,
  cpp: `// Write your solution here
#include <iostream>
using namespace std;

int main() {
    // Your code
    cout << "Hello, World!" << endl;
    return 0;
}`,
  c: `// Write your solution here
#include <stdio.h>

int main() {
    // Your code
    printf("Hello, World!\\n");
    return 0;
}`,
  csharp: `// Write your solution here
using System;

class Solution {
    static void Main() {
        // Your code
        Console.WriteLine("Hello, World!");
    }
}`,
  go: `// Write your solution here
package main

import "fmt"

func main() {
    // Your code
    fmt.Println("Hello, World!")
}`,
  rust: `// Write your solution here
fn main() {
    // Your code
    println!("Hello, World!");
}`,
  php: `<?php
// Write your solution here
// Your code
echo "Hello, World!";
?>`,
  ruby: `# Write your solution here
# Your code
puts "Hello, World!"`,
  swift: `// Write your solution here
import Foundation

// Your code
print("Hello, World!")`,
  kotlin: `// Write your solution here
fun main() {
    // Your code
    println("Hello, World!")
}`,
  typescript: `// Write your solution here
function solution(): string {
    // Your code
    return "Hello, World!";
}

console.log(solution());`,
};

const CodeEditor: React.FC<CodeEditorProps> = ({
  language = 'javascript',
  initialCode,
  taskDescription,
  initialStdin = '',
  onCodeChange,
  onLanguageChange,
  onStdinChange,
  onCodeSubmit,
  readOnly = false,
  height = '400px',
}) => {
  const [code, setCode] = useState<string>(
    initialCode || DEFAULT_CODE[language]
  );
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(language);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<string>('');
  const [stdin, setStdin] = useState(initialStdin);
  const [editorHeight, setEditorHeight] = useState<number>(400);
  const editorRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    } else {
      setCode(DEFAULT_CODE[selectedLanguage]);
    }
  }, [selectedLanguage, initialCode]);

  useEffect(() => {
    const updateEditorHeight = () => {
      if (containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        // Subtract toolbar height (~60px) and potential output panel
        const toolbarHeight = taskDescription ? 230 : 140;
        const outputHeight = (output || error) ? 160 : 0;
        const calculatedHeight = containerHeight - toolbarHeight - outputHeight;
        if (calculatedHeight > 0) {
          setEditorHeight(Math.max(180, calculatedHeight));
        }
      }
    };

    // Use requestAnimationFrame to ensure DOM is fully rendered
    const timeoutId = setTimeout(() => {
      updateEditorHeight();
    }, 0);

    window.addEventListener('resize', updateEditorHeight);
    
    // Use ResizeObserver for better tracking
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateEditorHeight);
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateEditorHeight);
      resizeObserver.disconnect();
    };
  }, [output, error]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    onCodeChange?.(newCode);
    setOutput('');
    setError(null);
    setExecutionStatus('');
  };

  const handleStdinChange = (value: string) => {
    setStdin(value);
    onStdinChange?.(value);
    setOutput('');
    setError(null);
    setExecutionStatus('');
  };

  const handleRun = async () => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }

    setIsRunning(true);
    setOutput('');
    setError(null);
    setExecutionStatus('');

    try {
      const result = await executeCode(code, selectedLanguage, stdin);
      setExecutionStatus(result.status);
      
      if (result.error) {
        setError(result.error);
        setOutput('');
      } else {
        setOutput(result.output);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute code');
      setExecutionStatus('Error');
      setOutput('');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = () => {
    if (!code.trim()) {
      toast.error('Please write some code first');
      return;
    }
    onCodeSubmit?.(code, selectedLanguage, output || undefined, stdin, error || undefined);
    toast.success('Code submitted!');
  };

  return (
    <div ref={containerRef} className="flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden" style={{ height: height || '400px', minHeight: height || '400px' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Language:</label>
          <select
            value={selectedLanguage}
            onChange={(e) => {
              const nextLanguage = e.target.value as SupportedLanguage;
              setSelectedLanguage(nextLanguage);
              onLanguageChange?.(nextLanguage);
              setOutput('');
              setError(null);
              setExecutionStatus('');
            }}
            disabled={readOnly}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="csharp">C#</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="php">PHP</option>
            <option value="ruby">Ruby</option>
            <option value="swift">Swift</option>
            <option value="kotlin">Kotlin</option>
            <option value="typescript">TypeScript</option>
          </select>
        </div>
        <div className="flex gap-2">
          {!readOnly && (
            <>
              <button
                onClick={handleRun}
                disabled={isRunning}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-md transition-colors flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Running...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Run
                  </>
                )}
              </button>
              {onCodeSubmit && (
                <button
                  onClick={handleSubmit}
                  disabled={isRunning}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md transition-colors"
                >
                  Submit Code
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {taskDescription && (
        <div className="flex-shrink-0 border-b border-gray-200 bg-blue-50 px-4 py-3">
          <h4 className="text-sm font-semibold text-blue-900">Current interviewer prompt</h4>
          <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap text-sm text-blue-900">{taskDescription}</p>
        </div>
      )}
      {!readOnly && (
        <label className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-2 text-sm text-gray-700">
          <span className="font-medium">stdin</span>
          <textarea
            value={stdin}
            onChange={event => handleStdinChange(event.target.value)}
            rows={2}
            placeholder="Optional input passed to your program"
            className="min-w-0 flex-1 resize-y rounded border border-gray-300 px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
          />
        </label>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: '180px' }}>
        <Editor
          height={`${editorHeight}px`}
          language={selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorDidMount}
          theme="vs-light"
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Output Panel */}
      {(output || error) && (
        <div className="border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="p-3 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700">
              {error ? 'Error' : `Output${executionStatus ? ` · ${executionStatus}` : ''}`}
            </h4>
          </div>
          <div className="p-4 max-h-48 overflow-y-auto">
            <pre className={`text-sm font-mono whitespace-pre-wrap ${error ? 'text-red-600' : 'text-gray-800'}`}>
              {error || output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeEditor;
