import Editor from "@monaco-editor/react";

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

export function JsonEditor({ value, onChange }: JsonEditorProps) {
  return (
    <Editor
      height="360px"
      language="json"
      theme="vs-dark"
      value={value}
      onChange={(next) => onChange(next ?? "")}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        ariaLabel: "Workflow steps",
      }}
    />
  );
}
