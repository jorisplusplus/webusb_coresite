<script setup>
import { ref, reactive } from "vue";
import Tree from "vue3-treeview";
import "vue3-treeview/dist/style.css";
import { VAceEditor } from "vue3-ace-editor";

const config = reactive({
  roots: ["id1", "id2"],
  leaves: [],
});

const filename = ref("/flash/cache/scratch.py")

const nodes = reactive({
  id1: {
    text: "text1",
    children: ["id11", "id12"],
  },
  id11: {
    text: "text11",
  },
  id12: {
    text: "text12",
  },
  id2: {
    text: "text2",
  },
});

function addServerNode(n) {
  console.log("tata");

  if (n.children && n.children.length > 0) return;

  // set node loading state to tree
  n.state.isLoading = true;

  // fake server call
  setTimeout(() => {
    // create a fake node
    const id = `${Date.now()}`;
    const newNode = {
      text: `loaded from server`,
      children: false,
      state: {},
    };

    // add the node to nodes
    nodes[id] = newNode;
    config.leaves.push(id);
    // set children
    n.children = [id];
    // end loading
    n.state.isLoading = false;
  }, 500);
}
</script>

<template>
    <v-card class="ma-3 pa-4">
      <v-row no-gutters>
        <v-col cols="3">
          <v-row no-gutters>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-folder-plus</v-icon>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-file</v-icon>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-file-document</v-icon>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-delete</v-icon>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-download</v-icon>
          </v-btn>
          </v-row>
        </v-col>
        <v-col>
          <v-row no-gutters>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-play</v-icon>
          </v-btn>
          <v-btn color="primary" class="grey lighten-4 ma-1">
            <v-icon large>mdi-content-save</v-icon>
          </v-btn>
          <v-text-field
            class="mt-n3"
            label="Filename"
            v-model="filename"
          ></v-text-field>
          </v-row>
        </v-col>
      </v-row>
      <v-row no-gutters>
       <v-col cols="3">
      <Tree :nodes="nodes" :config="config" @nodeOpened="addServerNode">
        <template #loading-slot>
          <div class="progress">
            <div class="indeterminate"></div>
          </div>
        </template>
      </tree>
      </v-col>
      <v-col>
      <v-ace-editor
        lang="html"
        value="test"
        theme="chrome"
        style="height: 600px" />
    </v-col>
    </v-row>
    </v-card>
    <v-card class="ma-3 pa-4">
        test
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