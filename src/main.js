import { createApp } from 'vue/dist/vue.esm-bundler'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import { loadFonts } from './plugins/webfontloader'
import { createRouter, createWebHashHistory} from 'vue-router'
import HomeView from "./components/HomeView"
import ProgrammingView from "./components/ProgrammingView"
import { WEBUSB } from './webusb'
import { ref } from 'vue'

const About = { template: '<div>About</div>' }
const webusb = ref(new WEBUSB());

const routes = [
  { path: '/', component: HomeView },
  { path: '/programming', component: ProgrammingView, props: {webusb:webusb}},
  { path: '/about', component: About, props: {webusb:webusb} },
  { path: '/settings', component: About, props: {webusb:webusb}},
  { path: '/update', component: About, props: {webusb:webusb}},
]

const router = createRouter({
  // 4. Provide the history implementation to use. We are using the hash history for simplicity here.
  history: createWebHashHistory(),
  routes, // short for `routes: routes`
})



loadFonts()



createApp(App, {webusb:webusb})
  .use(vuetify)
  .use(router)
  .mount('#app')
