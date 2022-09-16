<script setup>
import { ref, reactive, defineProps, onMounted} from "vue";
import Tree from "vue3-treeview";
import "vue3-treeview/dist/style.css";
import { VAceEditor } from "vue3-ace-editor";
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/theme-monokai';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const props = defineProps(["webusb"]);
console.log(props.webusb);
//File tree view
const config = reactive({
  roots: ["flash", "sdcard"],
  leaves: [],
  dragAndDrop: true,
  editable: false
});

const nodes = reactive({
  flash: {
    text: "📁 flash",
    name: "/flash",
    type: "folder",
    id: "flash",
    state: {
      draggable: false
    },
    children: [],
  },
  sdcard: {
    text: "SD Card",
    name: "/sdcard",
    id: "sdcard",
    type: "folder",
    state: {
      draggable: false
    },
    children: [],
  },
});

let focusNode = "flash";

//Ace editor
const editorFilename = ref("/flash/cache/scratch.py")
const editorContent = ref("")

//Terminal
const xterm = ref(null);
onMounted(() => {
  const terminal = new Terminal({convertEol: true});
  const terminalFit = new FitAddon();
  terminal.loadAddon(terminalFit);
  console.log(xterm.value);
  terminal.open(xterm.value);
  console.log(terminal);
  props.webusb.value.registerstdout((str) => {terminal.write(str)});
  terminal.onData((data) => {props.webusb.value.writeserial(data)});
});

//Buttons
async function createDir() {
  var filename = prompt("Enter dirname", "");
  if (filename == null || filename == "") {
    return
  }
  let dir = "/flash/"
  if (config.leaves.includes(focusNode)) {
    dir = "/"+focusNode.slice(0, focusNode.lastIndexOf("/")+1);
  } else {
    dir = "/"+focusNode+"/";
  }
  await props.webusb.value.createfolder(dir+filename);
}

async function createFile() {
  var filename = prompt("Enter filename", "");
  if (filename == null || filename == "") {
    return
  }
  let dir = "/flash/"
  if (config.leaves.includes(focusNode)) {
    dir = "/"+focusNode.slice(0, focusNode.lastIndexOf("/")+1);
  } else {
    dir = "/"+focusNode+"/";
  }
  await props.webusb.value.savetextfile(dir+filename, "");
}

async function renameFile() {
  if (!config.leaves.includes(focusNode)) {
    return;
  }
  var filename = prompt("Enter filename", "");
  if (filename == null || filename == "") {
    return
  }
  let dir = "/"+focusNode.slice(0, focusNode.lastIndexOf("/")+1);
  await props.webusb.value.movefile("/"+focusNode, "/"+dir+"/"+filename);
}

async function deleteFile() {
  if (focusNode == "flash" || focusNode == "sdcard") { //Can't delete root nodes
    return;
  }
  if (!confirm("Delete "+focusNode+" ?")) {
    return;
  }
  if (config.leaves.includes(focusNode)) {
    await props.webusb.value.delfile("/"+focusNode);
  } else {
    await props.webusb.value.deldir("/"+focusNode)
  }
}

function downloadFolder() {

}

function removeTreeNode(childid) {
  if (!(childid in nodes)) {
    return;
  }
  let node = nodes[childid];
  for (const child in node.children) {
    removeTreeNode(child);
  }
  delete nodes[childid];
  const indexleaf = config.leaves.indexOf(childid);
  if (indexleaf > -1) {
    config.leaves.splice(indexleaf, 1);
  }

}

function addTreeChild(n, name, type) {
  const id = n.id + "/" + name;
  if (n.children.includes(id)) {
    return id;
  }
  const emoji = type == "file" ? "📄" : "📁";
  
  const newNode = {
      text: emoji + " " + name,
      type: type,
      name: name,
      id: id,
      children: [],
      state: {},
    };
  console.log("New node");
  console.log(newNode);
  nodes[id] = newNode;
  if (type == "file") {
    config.leaves.push(id);
  }
  n.children.push(id);
  return id;
}

async function refreshTreeNode(n) {
  n.state.isLoading = true;
  let res = await props.webusb.value.fetchdir("/"+n.id)
  console.log(res)
  let childCopy = [...n.children]; //Copy children list
  for (const item of res.slice(1)) {
    const id = addTreeChild(n, item["filename"], item["type"]);
    const index = childCopy.indexOf(id);
    if (index > -1) {
      childCopy.splice(index, 1);
    }
  }
  for (const item of childCopy) {
    console.log("Removing: "+item);
    removeTreeNode(item); //Remove item from tree
    n.children.splice(n.children.indexOf(item), 1); //Remove item from children
  }
  n.state.isLoading = false;
}


async function focus(n) {
  console.log(n)
  focusNode = n.id;
  if (n.type == "folder") {
    await refreshTreeNode(n);
  } else {
    let res = await props.webusb.value.readfile("/"+n.id);
    editorContent.value = res;
    editorFilename.value = "/"+n.id;
  }
}

async function saveFile() {
  await props.webusb.value.savetextfile(editorFilename.value, editorContent.value);
}


</script>

<template>
    <v-card class="ma-3 pa-4">
      <v-row no-gutters>
        <v-col cols="3">
          <v-row no-gutters>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="createDir">
            <v-icon large>mdi-folder-plus</v-icon>
            <v-tooltip activator="parent" location="bottom">Create folder</v-tooltip>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="createFile">
            <v-icon large>mdi-file</v-icon>
            <v-tooltip activator="parent" location="bottom">Create file</v-tooltip>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="renameFile">
            <v-icon large>mdi-file-document</v-icon>
            <v-tooltip activator="parent" location="bottom">Rename file</v-tooltip>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="deleteFile">
            <v-icon large>mdi-delete</v-icon>
            <v-tooltip activator="parent" location="bottom">Delete</v-tooltip>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="downloadFolder">
            <v-icon large>mdi-download</v-icon>
            <v-tooltip activator="parent" location="bottom">Download folder</v-tooltip>
          </v-btn>
          </v-row>
        </v-col>
        <v-col>
          <v-row no-gutters>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-play</v-icon>
            <v-tooltip activator="parent" location="bottom">Execute</v-tooltip>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1" @click="saveFile">
            <v-icon large>mdi-content-save</v-icon>
            <v-tooltip activator="parent" location="bottom">Save</v-tooltip>
          </v-btn>
          <v-text-field
            class="mt-n3"
            label="Filename"
            v-model="editorFilename"
          ></v-text-field>
          </v-row>
        </v-col>
      </v-row>
      <v-row no-gutters>
       <v-col cols="3">
      <Tree :nodes="nodes" :config="config" @node-opened="refreshTreeNode" @node-focus="focus">
        <template #loading-slot>
          <div class="progress">
            <div class="indeterminate"></div>
          </div>
        </template>
      </tree>
      </v-col>
      <v-col>
      <v-ace-editor
        lang="python"
        v-model:value="editorContent"
        theme="monokai"
        style="height: 600px" />
    </v-col>
    </v-row>
    </v-card>
    <v-card class="ma-3 pa-4">
        Python terminal
        <div ref="xterm"></div>
    </v-card>
</template>

<style scoped>
/* * {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  font-size: 14px;
} */
.v-btn {
  min-width: 35px;
  width:35px;
  min-height: 35px;
  height: 35px;
}
</style>