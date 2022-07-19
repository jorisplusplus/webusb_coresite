<script setup>
  import { ref } from 'vue'

  const drawer = ref(true)
  const group = ref(null)
</script>

<template>
  <v-app>
    <v-app-bar
      color="deep-purple accent-4"
      dark
      prominent
    >
      <v-app-bar-nav-icon @click.stop="drawer = !drawer"></v-app-bar-nav-icon>

      <v-toolbar-title>WebUSB Core Site</v-toolbar-title>

      <v-spacer></v-spacer>

      <v-btn icon>
        <v-icon>mdi-connection</v-icon>
        <v-tooltip activator="parent" location="bottom">Connect badge</v-tooltip>
      </v-btn>

      <v-btn icon>
        <v-icon>mdi-restart</v-icon>
        <v-tooltip activator="parent" location="bottom">Reset badge</v-tooltip>
      </v-btn>
    </v-app-bar>
    <v-navigation-drawer v-model="drawer">
       <a class="logo-wrapper"><img alt="" class="img-fluid" src="./assets/hackzone_logo.png"/></a>
      <v-tabs direction="vertical">
        
        <v-tab to="/">Home</v-tab>
        <v-tab to="/programming"><v-icon>mdi-console</v-icon>Programming</v-tab>
        <v-tab to="/settings"><v-icon>mdi-cog</v-icon>Settings</v-tab>
        <v-tab to="/update"><v-icon>mdi-flash</v-icon>Update</v-tab>
        <v-tab to="/about"><v-icon>mdi-information</v-icon>About</v-tab>

      </v-tabs>
    </v-navigation-drawer>
    <v-main>
     <router-view></router-view>
    </v-main>    
  </v-app>
</template>

<style>
@import url("https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap");
.navbar-light .navbar-brand {
  margin-left: 15px;
  color: #2196f3 !important;
  font-weight: bolder;
}
.placement {
  position: fixed;
  right: 10px;
  top: 10px;
  z-index:8000;
}

main {
  background-color: #ededee;
}
.flexible-content {
  transition: padding-left 0.3s;
  padding-left: 270px;
  height: 100%;
}
.flexible-navbar {
  transition: padding-left 0.5s;
  padding-left: 270px;
}
.v-navigation-drawer {
  background-color: rgb(163, 46, 46);
}
.sidebar-fixed .logo-wrapper img {
  width: 100%;
  padding: 2.5rem;
}
.sidebar-fixed .list-group-item {
  display: block !important;
  transition: background-color 0.3s;
}
.sidebar-fixed .list-group .active {
  box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.16), 0 2px 10px 0 rgba(0, 0, 0, 0.12);
  border-radius: 5px;
}
</style>