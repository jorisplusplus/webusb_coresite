import { createApp } from 'vue/dist/vue.esm-bundler'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import { loadFonts } from './plugins/webfontloader'
import { createRouter, createWebHashHistory} from 'vue-router'
import HomeView from "./components/HomeView"
import ProgrammingView from "./components/ProgrammingView"

const Home = { template: '<div>Home</div>' }
const About = { template: '<div>About</div>' }

const routes = [
  { path: '/', component: HomeView },
  { path: '/programming', component: ProgrammingView},
  { path: '/about', component: About },
  { path: '/settings', component: About},
  { path: '/update', component: About},
]

const router = createRouter({
  // 4. Provide the history implementation to use. We are using the hash history for simplicity here.
  history: createWebHashHistory(),
  routes, // short for `routes: routes`
})



loadFonts()



createApp(App)
  .use(vuetify)
  .use(router)
  .mount('#app')
